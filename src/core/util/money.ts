/**
 * Money is always stored as INTEGER minor units of a currency:
 *   KHR → whole riel (1 = 1 ៛),  USD → cents (1 = $0.01).
 * Never floats in the database. Each sale snapshots its currency and KHR/USD rate.
 *
 * Riel rules (same as POS-52, docs/03-Report/69-Report-Riel-Rounding-100.md):
 * every riel amount shown to people is rounded to the smallest note (default 100 ៛),
 * and totals are built from rounded LINES so they add up to what the customer sees.
 */
export type Currency = 'KHR' | 'USD'

export const DEFAULT_RIEL_STEP = 100

/** Round a riel amount to the nearest note step (half away from zero). */
export function roundRiel(riel: number, step: number = DEFAULT_RIEL_STEP): number {
  if (!step || step <= 1) return Math.round(riel)
  const sign = riel < 0 ? -1 : 1
  return sign * Math.round(Math.abs(riel) / step) * step
}

/** USD cents → riel, rounded to the note step. */
export function centsToRiel(cents: number, khrPerUsd: number, step = DEFAULT_RIEL_STEP): number {
  return roundRiel((cents / 100) * khrPerUsd, step)
}

/** Riel → USD cents (rounded to the cent). */
export function rielToCents(riel: number, khrPerUsd: number): number {
  return Math.round((riel / khrPerUsd) * 100)
}

/** Line total in minor units: unit price × qty, riel lines rounded per line. */
export function lineTotal(unitMinor: number, qty: number, currency: Currency, step = DEFAULT_RIEL_STEP): number {
  const raw = unitMinor * qty
  return currency === 'KHR' ? roundRiel(raw, step) : Math.round(raw)
}

const khrFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Format minor units for display, e.g. 12500 KHR → "12,500 ៛", 350 USD → "$3.50". */
export function formatMoney(minor: number, currency: Currency): string {
  if (currency === 'KHR') return `${khrFmt.format(minor)} ៛`
  const sign = minor < 0 ? '-' : ''
  return `${sign}$${usdFmt.format(Math.abs(minor) / 100)}`
}
