/**
 * Backup encryption (WebCrypto, runs offline in the browser). A backup password is turned into an
 * AES-256-GCM key with PBKDF2-SHA-256. The key is kept on this device as a non-extractable
 * CryptoKey in IndexedDB, so automatic backups can be encrypted without asking each time; the
 * password itself is never stored. Encrypted file:
 *
 *   "KITENC1" (7 bytes) | salt (16) | iv (12) | AES-GCM ciphertext of the backup zip
 *
 * Without the password an encrypted backup cannot be opened, by anyone, including Kitroid.
 */
const MAGIC = new TextEncoder().encode('KITENC1')
export const PBKDF2_ITERATIONS = 310_000

export function isEncrypted(bytes: Uint8Array): boolean {
  return bytes.length > 35 && MAGIC.every((b, i) => bytes[i] === b)
}

export async function deriveKey(password: string, salt: Uint8Array, extractable = false): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(data: Uint8Array, key: CryptoKey, salt: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource))
  const out = new Uint8Array(MAGIC.length + 16 + 12 + ct.length)
  out.set(MAGIC, 0)
  out.set(salt, MAGIC.length)
  out.set(iv, MAGIC.length + 16)
  out.set(ct, MAGIC.length + 28)
  return out
}

/** Decrypt with the password. Throws 'BAD_PASSWORD' if it is wrong (or the file was changed). */
export async function decryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = data.slice(MAGIC.length, MAGIC.length + 16)
  const iv = data.slice(MAGIC.length + 16, MAGIC.length + 28)
  const key = await deriveKey(password, salt)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data.slice(MAGIC.length + 28) as BufferSource))
  } catch {
    throw new Error('BAD_PASSWORD')
  }
}

// ── Per-tool backup key stored on this device (IndexedDB) ───────────────────

interface StoredKey {
  tool: string
  key: CryptoKey
  salt: Uint8Array
  set_at: number
}
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kitroid-keys', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('keys', { keyPath: 'tool' })
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction('keys', mode).objectStore('keys'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export async function getBackupKey(tool: string): Promise<StoredKey | null> {
  try {
    return ((await tx('readonly', (s) => s.get(tool))) as StoredKey | undefined) ?? null
  } catch {
    return null
  }
}
export async function setBackupPassword(tool: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  await tx('readwrite', (s) => s.put({ tool, key, salt, set_at: Date.now() } satisfies StoredKey))
}
export async function clearBackupPassword(tool: string) {
  await tx('readwrite', (s) => s.delete(tool))
}
