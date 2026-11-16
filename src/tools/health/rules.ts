/**
 * Health helpers: pure functions, tested by scripts/test-health.mts.
 * Ranges are common adult reference ranges, shown only as a guide; they are not a diagnosis.
 */

export type Kind = 'BP' | 'PULSE' | 'GLUCOSE' | 'WEIGHT' | 'HEIGHT' | 'TEMP' | 'SPO2'
export type Level = 'low' | 'normal' | 'elevated' | 'high' | 'veryHigh'

export const UNITS: Record<Kind, string> = { BP: 'mmHg', PULSE: 'bpm', GLUCOSE: 'mg/dL', WEIGHT: 'kg', HEIGHT: 'cm', TEMP: '°C', SPO2: '%' }

/** Blood pressure (adult, AHA categories). */
export function bpLevel(sys: number, dia: number): Level {
  if (sys >= 180 || dia >= 120) return 'veryHigh'
  if (sys >= 130 || dia >= 80) return 'high'
  if (sys >= 120) return 'elevated'
  if (sys < 90 || dia < 60) return 'low'
  return 'normal'
}
/** Blood sugar in mg/dL. Fasting: <70 low, <100 normal, <126 elevated (pre-diabetes), else high. After a meal / random: <140 normal, <200 elevated. */
export function glucoseLevel(mgdl: number, context: string | null | undefined): Level {
  if (mgdl < 70) return 'low'
  if (context === 'FASTING') return mgdl < 100 ? 'normal' : mgdl < 126 ? 'elevated' : 'high'
  return mgdl < 140 ? 'normal' : mgdl < 200 ? 'elevated' : 'high'
}
export function tempLevel(c: number): Level {
  if (c < 35) return 'low'
  if (c < 37.5) return 'normal'
  if (c < 38) return 'elevated'
  if (c < 39.5) return 'high'
  return 'veryHigh'
}
export function spo2Level(p: number): Level {
  return p >= 95 ? 'normal' : p >= 90 ? 'elevated' : 'veryHigh'
}
export function pulseLevel(bpm: number): Level {
  return bpm < 50 ? 'low' : bpm <= 100 ? 'normal' : bpm <= 120 ? 'elevated' : 'high'
}
export function levelOf(kind: Kind, v1: number, v2?: number | null, context?: string | null): Level | null {
  switch (kind) {
    case 'BP':
      return bpLevel(v1, v2 ?? 0)
    case 'GLUCOSE':
      return glucoseLevel(v1, context)
    case 'TEMP':
      return tempLevel(v1)
    case 'SPO2':
      return spo2Level(v1)
    case 'PULSE':
      return pulseLevel(v1)
    default:
      return null
  }
}

export const mmolToMgdl = (mmol: number) => Math.round(mmol * 18.0182)
export const mgdlToMmol = (mg: number) => Math.round((mg / 18.0182) * 10) / 10

/** Body-mass index from kg and cm (null if missing). */
export function bmi(kg: number | null | undefined, cm: number | null | undefined): number | null {
  if (!kg || !cm) return null
  return Math.round((kg / (cm / 100) ** 2) * 10) / 10
}
export function bmiLevel(b: number): Level {
  return b < 18.5 ? 'low' : b < 23 ? 'normal' : b < 27.5 ? 'elevated' : 'high' // Asian cut-offs (WHO 2004)
}

/** Age in whole years (or months under 2) on `on`. */
export function age(birth: string | null | undefined, on: string): { years: number; months: number } | null {
  if (!birth) return null
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  let months = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0)
  if (months < 0) return null
  return { years: Math.floor(months / 12), months }
}

export interface MedLike {
  id: string
  person_id: string
  name: string
  dose: string | null
  times: string
  start_date: string
  end_date: string | null
  active: number
}
export const timesOf = (times: string) =>
  times
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
    .map((s) => s.padStart(5, '0'))
    .sort()

/** Doses due on `date`, sorted by time. */
export function dosesOn<T extends MedLike>(meds: T[], date: string): { med: T; time: string }[] {
  const out: { med: T; time: string }[] = []
  for (const m of meds) {
    if (!m.active || m.start_date > date || (m.end_date && m.end_date < date)) continue
    for (const time of timesOf(m.times)) out.push({ med: m, time })
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name))
}
