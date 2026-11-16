// Backup encryption tests (WebCrypto in Node).  node scripts/test-privacy.mts
import { encryptBytes, decryptBytes, deriveKey, isEncrypted } from '../src/core/privacy/crypto.ts'

let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

const zip = new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode('blood pressure 135/85, diabetes')])
const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await deriveKey('my family 2026', salt)
const enc = await encryptBytes(zip, key, salt)

check('encrypted file starts with KITENC1 and is not a zip', isEncrypted(enc) && !(enc[0] === 0x50 && enc[1] === 0x4b))
check('plain zip is not seen as encrypted', !isEncrypted(zip))
check('the private text is not readable inside', !new TextDecoder('latin1').decode(enc).includes('diabetes'))
const back = await decryptBytes(enc, 'my family 2026')
check('right password gives back the exact bytes', back.length === zip.length && back.every((b, i) => b === zip[i]))
let err = ''
try {
  await decryptBytes(enc, 'my family 2025')
} catch (e: any) {
  err = e.message
}
check('wrong password → BAD_PASSWORD', err === 'BAD_PASSWORD')
const tampered = enc.slice()
tampered[tampered.length - 1] ^= 1
err = ''
try {
  await decryptBytes(tampered, 'my family 2026')
} catch (e: any) {
  err = e.message
}
check('a changed file is refused (AES-GCM integrity)', err === 'BAD_PASSWORD')
const enc2 = await encryptBytes(zip, key, salt)
check('same data encrypts differently each time (random IV)', enc2.some((b, i) => b !== enc[i]))

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
