/**
 * Signed Kitroid codes (offline, WebCrypto ECDSA P-256 / SHA-256).
 *
 *   unsigned:  KX1.<type>.<data>
 *   signed:    KX1.<type>.<data>.<pub>.<sig>
 *
 * <pub> = the signer's raw public key (65 bytes, base64url); <sig> = ECDSA signature (raw r||s,
 * 64 bytes, base64url) over the text "KX1.<type>.<data>.<pub>". Any change to the data or the key
 * breaks the signature.
 *
 * A valid signature proves the code was made with that key and not changed since. It does NOT by
 * itself prove WHO owns the key (anyone can make a key and call themselves "Clinic Sok"): the
 * receiver must trust the key once, e.g. by scanning the clinic's card in person, or by checking
 * the fingerprint with the clinic on the phone. `fingerprint()` gives a short, readable form.
 */

const b64u = (b: Uint8Array) => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIG = { name: 'ECDSA', hash: 'SHA-256' } as const

export interface SigningKey {
  privateJwk: JsonWebKey // keep private: stored inside the signer's own database (and its backups)
  pub: string // base64url raw public key, safe to share
}

export async function generateSigningKey(): Promise<SigningKey> {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
  return { privateJwk, pub }
}

/** Short readable fingerprint of a public key, e.g. "7F3A-91C2-0B5E-D4A8" (first 8 bytes of SHA-256). */
export async function fingerprint(pub: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64u(pub) as BufferSource))
  const hex = [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join('')
  return hex.match(/.{4}/g)!.join('-')
}

/** Sign an unsigned code ("KX1.<type>.<data>"). Returns the signed code. */
export async function signCode(code: string, key: SigningKey): Promise<string> {
  const base = code.trim().split('.').slice(0, 3).join('.')
  const priv = await crypto.subtle.importKey('jwk', key.privateJwk, ALG, false, ['sign'])
  const msg = `${base}.${key.pub}`
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, priv, new TextEncoder().encode(msg)))
  return `${msg}.${b64u(sig)}`
}

export type Verified =
  | { status: 'unsigned' }
  | { status: 'invalid' } // signature does not match: the code was changed or damaged
  | { status: 'signed'; pub: string; fingerprint: string }

/** Check the signature of a code (spaces / surrounding text ignored). */
export async function verifyCode(text: string): Promise<Verified> {
  const m = /KX1\.[a-z]+\.[A-Za-z0-9_-]+(?:\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+))?/.exec(text.replace(/\s+/g, ''))
  if (!m || !m[1]) return { status: 'unsigned' }
  const [whole, pub, sig] = m
  const msg = whole.slice(0, whole.length - sig.length - 1)
  try {
    const key = await crypto.subtle.importKey('raw', unb64u(pub) as BufferSource, ALG, false, ['verify'])
    const ok = await crypto.subtle.verify(SIG, key, unb64u(sig) as BufferSource, new TextEncoder().encode(msg))
    return ok ? { status: 'signed', pub, fingerprint: await fingerprint(pub) } : { status: 'invalid' }
  } catch {
    return { status: 'invalid' }
  }
}

// ── Trust list (receiver side) ──────────────────────────────────────────────

export interface TrustedSigner {
  pub: string
  fingerprint: string
  name: string
  phone?: string
  added_at: number
}
export type Trust = { level: 'trusted'; signer: TrustedSigner } | { level: 'unknown'; sameName?: TrustedSigner } | { level: 'none' }

/** How much to trust a verified code that claims to come from `claimedName`. */
export function trustOf(v: Verified, claimedName: string, list: TrustedSigner[]): Trust {
  if (v.status !== 'signed') return { level: 'none' }
  const signer = list.find((s) => s.pub === v.pub)
  if (signer) return { level: 'trusted', signer }
  const norm = (s: string) => s.trim().toLowerCase()
  return { level: 'unknown', sameName: list.find((s) => norm(s.name) === norm(claimedName)) }
}
