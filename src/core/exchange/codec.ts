/**
 * Kitroid codes: small, versioned data packets passed between separate tools (and separate
 * businesses) without any server, as a QR code on paper or screen, or as text pasted/sent.
 *
 *   KX1.<type>.<base64url(deflate(JSON))>
 *
 * Each type carries ONLY what the receiver needs (data minimisation). A prescription (type
 * "rx") for a pharmacy has the patient code, date, clinic/doctor and the medicines, and never
 * the complaint, diagnosis, vitals or notes. The patient name is included only if the clinic
 * chooses to.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

export const KX_PREFIX = 'KX1'

export interface RxItem {
  n: string // medicine name (and strength), e.g. "Amoxicillin 500 mg"
  d?: string // dose per time, e.g. "1 tablet"
  t?: number // times per day
  days?: number
  q?: number // quantity to dispense
  u?: string // unit, e.g. "tablet", "bottle"
  note?: string // e.g. "after food"
}
export interface RxPayload {
  v: 1
  id: string // prescription id (ULID) — lets the pharmacy see if it was already dispensed
  code: string // patient code at the clinic
  name?: string // optional, only if the clinic includes it
  age?: number
  sex?: 'M' | 'F'
  date: string // YYYY-MM-DD
  clinic: string
  doctor?: string
  phone?: string // clinic phone
  items: RxItem[]
}
export interface KxTypes {
  rx: RxPayload
}
export type KxType = keyof KxTypes

const b64u = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function encodeKx<T extends KxType>(type: T, data: KxTypes[T]): string {
  return `${KX_PREFIX}.${type}.${b64u(deflateSync(strToU8(JSON.stringify(data)), { level: 9 }))}`
}

export type KxDecoded = { [K in KxType]: { type: K; data: KxTypes[K] } }[KxType]

/** Decode a Kitroid code (spaces/new lines are ignored). Throws NOT_KITROID_CODE / UNKNOWN_TYPE / BAD_CODE. */
export function decodeKx(text: string): KxDecoded {
  const s = text.replace(/\s+/g, '')
  const m = /KX1\.([a-z]+)\.([A-Za-z0-9_-]+)/.exec(s)
  if (!m) throw new Error('NOT_KITROID_CODE')
  const type = m[1] as KxType
  if (type !== 'rx') throw new Error('UNKNOWN_TYPE')
  let data: any
  try {
    data = JSON.parse(strFromU8(inflateSync(unb64u(m[2]))))
  } catch {
    throw new Error('BAD_CODE')
  }
  if (!validRx(data)) throw new Error('BAD_CODE')
  return { type, data }
}

function validRx(d: any): d is RxPayload {
  return (
    d && d.v === 1 && typeof d.id === 'string' && typeof d.code === 'string' && typeof d.date === 'string' && typeof d.clinic === 'string' &&
    Array.isArray(d.items) && d.items.length > 0 && d.items.every((i: any) => i && typeof i.n === 'string' && i.n.trim())
  )
}

/** Default quantity to dispense when the prescription gives none: times/day × days. */
export function rxQty(i: RxItem): number {
  if (i.q && i.q > 0) return i.q
  if (i.t && i.days) return i.t * i.days
  return 1
}

/** Normalise a medicine name for matching against a shop's product names. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s+(mg|ml|g|mcg|iu)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Best match of a prescription line against product names (0 = no match). */
export function matchScore(rxName: string, productName: string): number {
  const a = normName(rxName)
  const b = normName(productName)
  if (!a || !b) return 0
  if (a === b) return 100
  const wa = new Set(a.split(' '))
  const wb = new Set(b.split(' '))
  const common = [...wa].filter((w) => wb.has(w)).length
  if (!common) return 0
  // the first word is usually the drug name: weight it
  const first = a.split(' ')[0] === b.split(' ')[0] ? 30 : 0
  return Math.round((common / Math.max(wa.size, wb.size)) * 70) + first
}
