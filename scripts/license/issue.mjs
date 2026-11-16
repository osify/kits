// Issue a Kitroid license key.
//   node scripts/license/issue.mjs --name "LomOr & Co" --plan pro [--features stock,customers] [--exp 2027-12-31] [--key .license/kitroid-license-private.jwk]
//   node scripts/license/issue.mjs --name "LomOr & Co" --plan pro --months 1     # Buy Me a Coffee monthly member: 1 month + 7 days grace
//   [--note "BMC member 2026-11"] is stored in the key for your own records
// Prints a key like KIT1.<payload>.<signature> to give to the customer.
import { createPrivateKey, sign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split(/\s--/)
    .map((a) => a.replace(/^--/, '').trim())
    .filter(Boolean)
    .map((a) => {
      const i = a.indexOf(' ')
      return i < 0 ? [a, 'true'] : [a.slice(0, i), a.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
if (!args.name || !args.plan) {
  console.error('Usage: node scripts/license/issue.mjs --name "Shop name" --plan pro [--features a,b] [--exp YYYY-MM-DD]')
  process.exit(1)
}
/** --months N: expires N months from today plus 7 days of grace (members renew monthly). */
function monthsFromNow(n) {
  const d = new Date()
  d.setMonth(d.getMonth() + Number(n))
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}
const jwk = JSON.parse(readFileSync(args.key || '.license/kitroid-license-private.jwk', 'utf8'))
const key = createPrivateKey({ key: jwk, format: 'jwk' })
const payload = {
  v: 1,
  id: randomUUID(),
  name: args.name,
  plan: args.plan,
  features: args.features ? args.features.split(',').map((s) => s.trim()) : [],
  exp: args.exp || (args.months ? monthsFromNow(args.months) : null),
  iat: new Date().toISOString().slice(0, 10),
  ...(args.note ? { note: args.note } : {}),
}
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const body = b64u(JSON.stringify(payload))
// WebCrypto ECDSA verifies the raw r||s (IEEE P1363) signature format.
const sig = sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' })
console.log(`KIT1.${body}.${b64u(sig)}`)
