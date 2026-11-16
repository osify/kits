// Create the Kitroid license signing key pair (run ONCE).
//   node scripts/license/keygen.mjs [outDir]
// Writes <outDir>/kitroid-license-private.jwk (KEEP SECRET, never commit) and prints the public JWK
// to paste into src/core/license/publicKey.ts. Default outDir: ./.license (git-ignored).
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] || '.license'
const file = join(outDir, 'kitroid-license-private.jwk')
if (existsSync(file)) {
  console.error(`Refusing to overwrite ${file}. Licenses already issued would stop working.`)
  process.exit(1)
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
mkdirSync(outDir, { recursive: true })
writeFileSync(file, JSON.stringify(privateKey.export({ format: 'jwk' }), null, 2), { mode: 0o600 })
const pub = publicKey.export({ format: 'jwk' })
console.log(`Private key written to ${file}. Back it up somewhere safe and offline.`)
console.log('Public key for src/core/license/publicKey.ts:')
console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }))
