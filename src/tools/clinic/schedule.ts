/**
 * Clinic schedule rules (pure, no DB, runs in Node tests): doctors' weekly hours, appointment
 * overlaps (doctor, room, patient), free slots and the calendar's time range.
 *
 * Times are local 'HH:MM' strings, dates 'YYYY-MM-DD'. Clashes are WARNINGS, never blocks:
 * real clinics squeeze patients in, so the receptionist decides.
 */

/** Weekly hours: weekday '0' (Sunday) … '6' (Saturday) → ranges like [['08:00','12:00'],['14:00','17:00']]. */
export type Hours = Record<string, [string, string][]>

export interface Slot {
  id?: string
  date: string
  start: string
  minutes: number
  doctor_id?: string | null
  room_id?: string | null
  patient_id?: string | null
  status?: string
}

export const ACTIVE = new Set(['BOOKED', 'ARRIVED'])
export const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120]
export const COLORS = ['#0f766e', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#475569']

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

/** Weekday 0–6 of a 'YYYY-MM-DD' date (timezone-proof). */
export const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay()
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Monday of the week containing `date`. */
export const weekStart = (date: string) => addDays(date, -((weekday(date) + 6) % 7))

export function parseHours(json: string | null | undefined): Hours {
  try {
    const h = JSON.parse(json || '{}')
    return h && typeof h === 'object' ? h : {}
  } catch {
    return {}
  }
}
/** Clean ranges: valid, start < end, sorted. */
export function normalizeHours(h: Hours): Hours {
  const out: Hours = {}
  for (let d = 0; d < 7; d++) {
    const r = (h[String(d)] ?? []).filter(([a, b]) => /^\d\d:\d\d$/.test(a) && /^\d\d:\d\d$/.test(b) && toMin(a) < toMin(b)).sort((x, y) => toMin(x[0]) - toMin(y[0]))
    if (r.length) out[String(d)] = r
  }
  return out
}
export const hoursOn = (h: Hours, date: string) => h[String(weekday(date))] ?? []
/** True when the doctor has no hours set at all (then any time is fine). */
export const noHours = (h: Hours) => !Object.values(h).some((r) => r.length)
/** The whole appointment fits inside one of the doctor's ranges that day. */
export function withinHours(h: Hours, date: string, start: string, minutes: number) {
  if (noHours(h)) return true
  const s = toMin(start)
  return hoursOn(h, date).some(([a, b]) => s >= toMin(a) && s + minutes <= toMin(b))
}

export const overlaps = (a: Slot, b: Slot) => a.date === b.date && toMin(a.start) < toMin(b.start) + b.minutes && toMin(b.start) < toMin(a.start) + a.minutes

export interface Clash {
  kind: 'doctor' | 'room' | 'patient' | 'hours' | 'dayOff'
  with?: Slot
}
/** Everything wrong with booking `a` given the other appointments and the doctor's hours. */
export function clashes(a: Slot, others: Slot[], hours?: Hours): Clash[] {
  const out: Clash[] = []
  for (const b of others) {
    if (b.id && b.id === a.id) continue
    if (b.status && !ACTIVE.has(b.status)) continue
    if (!overlaps(a, b)) continue
    if (a.doctor_id && a.doctor_id === b.doctor_id) out.push({ kind: 'doctor', with: b })
    else if (a.room_id && a.room_id === b.room_id) out.push({ kind: 'room', with: b })
    else if (a.patient_id && a.patient_id === b.patient_id) out.push({ kind: 'patient', with: b })
  }
  if (hours && !noHours(hours)) {
    if (!hoursOn(hours, a.date).length) out.push({ kind: 'dayOff' })
    else if (!withinHours(hours, a.date, a.start, a.minutes)) out.push({ kind: 'hours' })
  }
  return out
}

/**
 * Free start times for a doctor on a date, every `step` minutes, where an appointment of
 * `minutes` fits inside their hours and does not overlap their booked ones. `after` (minutes
 * since midnight) skips times already past today.
 */
export function freeSlots(h: Hours, date: string, minutes: number, booked: Slot[], step = minutes, after = -1): string[] {
  const ranges = noHours(h) ? [] : hoursOn(h, date)
  const busy = booked.filter((b) => b.date === date && (!b.status || ACTIVE.has(b.status)))
  const out: string[] = []
  for (const [a, b] of ranges) {
    for (let s = toMin(a); s + minutes <= toMin(b); s += step) {
      if (s < after) continue
      const cand: Slot = { date, start: fromMin(s), minutes }
      if (!busy.some((x) => overlaps(cand, x))) out.push(cand.start)
    }
  }
  return out
}

/** Calendar rows: from the earliest start to the latest end (hours and bookings), whole hours, default 08:00–17:00. */
export function dayWindow(hoursList: Hours[], dates: string[], items: { start: string; minutes: number }[]): [number, number] {
  let lo = 8 * 60
  let hi = 17 * 60
  for (const h of hoursList) for (const d of dates) for (const [a, b] of hoursOn(h, d)) {
    lo = Math.min(lo, toMin(a))
    hi = Math.max(hi, toMin(b))
  }
  for (const i of items) {
    lo = Math.min(lo, toMin(i.start))
    hi = Math.max(hi, toMin(i.start) + i.minutes)
  }
  return [Math.floor(lo / 60) * 60, Math.min(24 * 60, Math.ceil(hi / 60) * 60)]
}

/** Side-by-side lanes for overlapping blocks in one column: lane index + lane count per item. */
export function lanes<T extends { start: string; minutes: number }>(items: T[]): { item: T; lane: number; of: number }[] {
  const sorted = [...items].sort((a, b) => toMin(a.start) - toMin(b.start) || b.minutes - a.minutes)
  const out: { item: T; lane: number; of: number }[] = []
  let group: { item: T; lane: number; of: number }[] = []
  let groupEnd = -1
  let laneEnds: number[] = []
  const flush = () => {
    for (const g of group) g.of = laneEnds.length
    out.push(...group)
    group = []
    laneEnds = []
  }
  for (const it of sorted) {
    const s = toMin(it.start)
    if (s >= groupEnd && group.length) flush()
    let lane = laneEnds.findIndex((e) => e <= s)
    if (lane < 0) lane = laneEnds.push(0) - 1
    laneEnds[lane] = s + it.minutes
    group.push({ item: it, lane, of: 1 })
    groupEnd = Math.max(groupEnd, s + it.minutes)
  }
  if (group.length) flush()
  return out
}
