/**
 * Financial calculations (pure functions, no UI). Money is handled in MINOR units
 * (riel, or USD cents) to avoid floating-point drift; riel amounts round to the note step.
 * Tested by scripts/test-finance.mts.
 */
import type { Currency } from '@/core/util/money'

export type LoanMethod = 'annuity' | 'principal' | 'flat'
export type RateUnit = 'month' | 'year'

export interface LoanInput {
  amount: number // minor units
  currency: Currency
  rate: number // percent, e.g. 1.5
  rateUnit: RateUnit
  months: number
  method: LoanMethod
  feePct?: number // upfront fee, % of amount (deducted at disbursement)
  start?: string // 'YYYY-MM-DD' disbursement date
  rielStep?: number // rounding of riel payments (default 100)
}

export interface LoanRow {
  n: number
  date: string | null
  payment: number
  principal: number
  interest: number
  balance: number
}

export interface LoanResult {
  rows: LoanRow[]
  firstPayment: number
  lastPayment: number
  totalInterest: number
  totalPaid: number
  fee: number
  received: number // amount actually received after the fee
  monthlyRate: number // nominal, %
  effMonthly: number // true cost per month incl. fees, %
  effAnnual: number // true cost per year, compounded, %
  apr: number // effMonthly × 12, %
}

const unit = (c: Currency, rielStep = 100) => (c === 'KHR' ? rielStep : 1)
/** Round to the currency unit (riel note step or 1 cent). */
export const roundTo = (v: number, step: number) => Math.round(v / step) * step

function addMonths(ymd: string, k: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1 + k, 1)
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  dt.setDate(Math.min(d, last)) // 31 Jan + 1 month → 28/29 Feb
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Monthly internal rate of return of cash flows [t0, t1, …] (bisection; robust). */
export function irr(flows: number[]): number {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0)
  let lo = -0.99
  let hi = 1
  if (npv(lo) * npv(hi) > 0) return NaN
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function loan(input: LoanInput): LoanResult {
  const n = Math.max(1, Math.round(input.months))
  const A = Math.max(0, input.amount)
  const step = unit(input.currency, input.rielStep)
  const r = (input.rateUnit === 'year' ? input.rate / 12 : input.rate) / 100
  const rows: LoanRow[] = []
  let bal = A

  if (input.method === 'annuity') {
    const exact = r === 0 ? A / n : (A * r) / (1 - Math.pow(1 + r, -n))
    const pay = roundTo(exact, step)
    for (let k = 1; k <= n; k++) {
      const interest = roundTo(bal * r, step)
      let principal = pay - interest
      if (k === n || principal > bal) principal = bal // last payment clears the balance
      bal -= principal
      rows.push({ n: k, date: null, payment: principal + interest, principal, interest, balance: bal })
    }
  } else {
    const pBase = roundTo(A / n, step)
    for (let k = 1; k <= n; k++) {
      const interest = input.method === 'flat' ? roundTo(A * r, step) : roundTo(bal * r, step)
      const principal = k === n ? bal : Math.min(pBase, bal)
      bal -= principal
      rows.push({ n: k, date: null, payment: principal + interest, principal, interest, balance: bal })
    }
  }
  if (input.start) rows.forEach((row) => (row.date = addMonths(input.start!, row.n)))

  const fee = roundTo((A * (input.feePct ?? 0)) / 100, step)
  const totalInterest = rows.reduce((s, x) => s + x.interest, 0)
  const totalPaid = rows.reduce((s, x) => s + x.payment, 0)
  const i = A > 0 ? irr([A - fee, ...rows.map((x) => -x.payment)]) : 0
  const effMonthly = Number.isFinite(i) ? i * 100 : NaN
  return {
    rows,
    firstPayment: rows[0]?.payment ?? 0,
    lastPayment: rows.at(-1)?.payment ?? 0,
    totalInterest,
    totalPaid,
    fee,
    received: A - fee,
    monthlyRate: r * 100,
    effMonthly,
    effAnnual: Number.isFinite(i) ? (Math.pow(1 + i, 12) - 1) * 100 : NaN,
    apr: effMonthly * 12,
  }
}

// ── savings ──────────────────────────────────────────────────────────────────
export interface SavingsInput {
  initial: number // minor units
  monthly: number // deposit at the end of each month, minor units
  rate: number // % per year (nominal), compounded monthly
  months: number
  taxPct?: number // tax withheld on interest, %
}

export interface SavingsRow {
  n: number
  deposit: number
  interest: number
  balance: number
}

export interface SavingsResult {
  rows: SavingsRow[]
  deposited: number
  interest: number // gross interest earned
  tax: number // withheld from it
  net: number // interest − tax
  final: number
}

export function savings(input: SavingsInput): SavingsResult {
  const n = Math.max(1, Math.round(input.months))
  const r = input.rate / 100 / 12
  const t = (input.taxPct ?? 0) / 100
  let bal = Math.max(0, input.initial)
  let interestTotal = 0
  let taxTotal = 0
  const rows: SavingsRow[] = []
  for (let k = 1; k <= n; k++) {
    const gross = bal * r
    const tax = gross * t
    bal += gross - tax + input.monthly
    interestTotal += gross
    taxTotal += tax
    rows.push({ n: k, deposit: input.monthly, interest: Math.round(gross - tax), balance: Math.round(bal) })
  }
  return {
    rows,
    deposited: input.initial + input.monthly * n,
    interest: Math.round(interestTotal),
    tax: Math.round(taxTotal),
    net: Math.round(interestTotal - taxTotal),
    final: Math.round(bal),
  }
}

// ── price & profit ───────────────────────────────────────────────────────────
export interface ProfitResult {
  cost: number
  price: number
  profit: number
  margin: number // % of price
  markup: number // % of cost
}

export function profitFromPrice(cost: number, price: number): ProfitResult {
  const profit = price - cost
  return { cost, price, profit, margin: price ? (profit / price) * 100 : 0, markup: cost ? (profit / cost) * 100 : 0 }
}

/** Selling price for a target margin (% of the price), rounded UP to the currency unit. */
export function priceForMargin(cost: number, marginPct: number, step: number): ProfitResult {
  const m = Math.min(marginPct, 99.9) / 100
  const price = Math.ceil(cost / (1 - m) / step) * step
  return profitFromPrice(cost, price)
}

/** Selling price for a target markup (% on top of cost), rounded UP to the currency unit. */
export function priceForMarkup(cost: number, markupPct: number, step: number): ProfitResult {
  const price = Math.ceil((cost * (1 + markupPct / 100)) / step) * step
  return profitFromPrice(cost, price)
}

// ── break-even ───────────────────────────────────────────────────────────────
export interface BreakEvenResult {
  contribution: number // price − variable cost, per unit
  unitsMonth: number // units per month to cover fixed costs (rounded up)
  unitsDay: number // per open day (rounded up)
  revenueMonth: number
  possible: boolean
}

export function breakEven(fixedMonth: number, price: number, variable: number, daysOpen: number): BreakEvenResult {
  const contribution = price - variable
  if (contribution <= 0) return { contribution, unitsMonth: Infinity, unitsDay: Infinity, revenueMonth: Infinity, possible: false }
  const unitsMonth = Math.ceil(fixedMonth / contribution)
  return {
    contribution,
    unitsMonth,
    unitsDay: Math.ceil(unitsMonth / Math.max(1, daysOpen)),
    revenueMonth: unitsMonth * price,
    possible: true,
  }
}
