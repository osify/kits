/**
 * Everyday shop calculators (pure functions). Money in MINOR units: riel, or USD cents.
 * Tested by scripts/test-calc.mts.
 */
export const RIEL_NOTES = [200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100]
export const USD_NOTES = [100, 50, 20, 10, 5, 2, 1] // dollars

const roundStep = (v: number, step: number) => Math.round(v / step) * step

// ── change when the customer pays in two currencies ─────────────────────────
export interface ChangeInput {
  due: number // minor units of dueCurrency
  dueCurrency: 'KHR' | 'USD'
  paidUsd: number // cents
  paidKhr: number // riel
  rate: number // riel per $1
  rielStep?: number // default 100
}

export interface ChangeResult {
  dueRiel: number
  paidRiel: number
  /** positive = give change, negative = customer still owes */
  diffRiel: number
  changeRiel: number // all change in riel (rounded to the note step)
  mixUsd: number // …or as whole dollars (in dollars) …
  mixRiel: number // … plus riel
  short: boolean
}

export function change(i: ChangeInput): ChangeResult {
  const step = i.rielStep ?? 100
  const dueRiel = i.dueCurrency === 'KHR' ? i.due : (i.due / 100) * i.rate
  const paidRiel = (i.paidUsd / 100) * i.rate + i.paidKhr
  const diff = paidRiel - dueRiel
  const diffRiel = roundStep(diff, step)
  const short = diffRiel < 0
  const changeRiel = Math.max(0, diffRiel)
  const mixUsd = Math.floor(changeRiel / i.rate)
  const mixRiel = roundStep(changeRiel - mixUsd * i.rate, step)
  return { dueRiel: roundStep(dueRiel, step), paidRiel: Math.round(paidRiel), diffRiel, changeRiel, mixUsd, mixRiel, short }
}

// ── counting the cash drawer ────────────────────────────────────────────────
export interface CashCount {
  riel: Record<number, number> // note value → how many
  usd: Record<number, number> // dollar note → how many
}

export function cashTotal(c: CashCount, rate: number) {
  const riel = RIEL_NOTES.reduce((s, n) => s + n * (c.riel[n] || 0), 0)
  const usd = USD_NOTES.reduce((s, n) => s + n * (c.usd[n] || 0), 0) // dollars
  return { riel, usd, totalRiel: riel + usd * rate, totalUsd: usd + riel / rate, notes: Object.values(c.riel).concat(Object.values(c.usd)).reduce((s, n) => s + (n || 0), 0) }
}

// ── VAT ──────────────────────────────────────────────────────────────────────
export function vat(amount: number, ratePct: number, mode: 'add' | 'remove') {
  const r = ratePct / 100
  if (mode === 'add') {
    const tax = Math.round(amount * r)
    return { net: amount, tax, gross: amount + tax }
  }
  const net = Math.round(amount / (1 + r))
  return { net, tax: amount - net, gross: amount }
}

// ── discounts ────────────────────────────────────────────────────────────────
export function discount(price: number, first: { kind: 'pct' | 'amount'; value: number }, second?: { kind: 'pct' | 'amount'; value: number } | null) {
  const apply = (p: number, d: { kind: 'pct' | 'amount'; value: number }) => Math.max(0, d.kind === 'pct' ? p * (1 - d.value / 100) : p - d.value)
  let final = apply(price, first)
  if (second && second.value) final = apply(final, second)
  final = Math.round(final)
  const saved = price - final
  return { final, saved, pct: price ? (saved / price) * 100 : 0 }
}

// ── unit price comparison ────────────────────────────────────────────────────
export interface PackOption {
  price: number // minor units
  qty: number // e.g. grams, ml, pieces
}

export function unitPrices(options: PackOption[]) {
  const per = options.map((o) => (o.price > 0 && o.qty > 0 ? o.price / o.qty : NaN))
  const valid = per.filter((x) => Number.isFinite(x))
  const best = valid.length ? Math.min(...valid) : NaN
  return per.map((p) => ({ perUnit: p, best: Number.isFinite(p) && p === best && valid.length > 1, moreThanBestPct: Number.isFinite(p) && best ? ((p - best) / best) * 100 : NaN }))
}
