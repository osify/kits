import { computed, ref } from 'vue'
import { LICENSE_PUBLIC_JWK } from './publicKey'

/**
 * Offline-verified licenses for paid features (no server).
 *
 *   key = "KIT1." + base64url(JSON payload) + "." + base64url(ECDSA P-256 signature)
 *   payload = { v, id, name, plan, features[], exp (YYYY-MM-DD | null), iat }
 *
 * The app verifies the signature with the public key built into it. Keys are issued with
 * scripts/license/issue.mjs. An offline app cannot stop a key from being shared; licences
 * show the licensee name on screen and receipts, which discourages that.
 *
 * Which features need which plan is decided in FEATURE_PLANS. Today EVERYTHING is free.
 */
export type Plan = 'free' | 'pro' | 'business'
export type Feature = 'stock' | 'customers' | 'parked' | 'directPrint' | 'driveBackup' | 'multiDevice'

/** Change a value to 'pro' / 'business' to make a feature paid. */
export const FEATURE_PLANS: Record<Feature, Plan> = {
  stock: 'free',
  customers: 'free',
  parked: 'free',
  directPrint: 'free',
  driveBackup: 'free',
  multiDevice: 'free',
}

const RANK: Record<Plan, number> = { free: 0, pro: 1, business: 2 }

/**
 * Usage limits per plan. `items` = items on sale at the same time (hidden items don't count).
 * Limits are checked when adding / un-hiding items; existing data is never locked.
 */
export type Limit = 'items'
export const PLAN_LIMITS: Record<Plan, Record<Limit, number>> = {
  free: { items: 50 },
  pro: { items: Infinity },
  business: { items: Infinity },
}

/** The limit for the current plan. A license can also carry the feature 'unlimitedItems'. */
export function limitFor(l: Limit): number {
  if (l === 'items' && license.value && !licenseExpired.value && license.value.features.includes('unlimitedItems')) return Infinity
  return PLAN_LIMITS[plan.value][l]
}

export interface LicensePayload {
  v: 1
  id: string
  name: string
  plan: Plan
  features: string[]
  exp: string | null
  iat: string
}

export type LicenseCheck = { ok: true; payload: LicensePayload; expired: boolean } | { ok: false; error: 'format' | 'signature' }

const b64uToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

let keyPromise: Promise<CryptoKey> | null = null
const publicKey = () =>
  (keyPromise ??= crypto.subtle.importKey('jwk', LICENSE_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']))

export async function verifyLicense(key: string): Promise<LicenseCheck> {
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'KIT1') return { ok: false, error: 'format' }
  try {
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await publicKey(),
      b64uToBytes(parts[2]),
      new TextEncoder().encode(parts[1]),
    )
    if (!valid) return { ok: false, error: 'signature' }
    const payload = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[1]))) as LicensePayload
    const expired = !!payload.exp && payload.exp < new Date().toISOString().slice(0, 10)
    return { ok: true, payload, expired }
  } catch {
    return { ok: false, error: 'format' }
  }
}

/** Current license state for the running tool (set by the tool after reading its stored key). */
export const license = ref<LicensePayload | null>(null)
export const licenseExpired = ref(false)

export const plan = computed<Plan>(() => (license.value && !licenseExpired.value ? license.value.plan : 'free'))

export function hasFeature(f: Feature): boolean {
  if (RANK[plan.value] >= RANK[FEATURE_PLANS[f]]) return true
  return !!license.value && !licenseExpired.value && license.value.features.includes(f)
}

export async function applyLicenseKey(key: string | null): Promise<LicenseCheck | null> {
  if (!key) {
    license.value = null
    licenseExpired.value = false
    return null
  }
  const r = await verifyLicense(key)
  if (r.ok) {
    license.value = r.payload
    licenseExpired.value = r.expired
  } else {
    license.value = null
    licenseExpired.value = false
  }
  return r
}
