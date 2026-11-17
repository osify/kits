/**
 * Cambodian payroll calculations: GDT Tax on Salary, Fringe Benefit Tax, NSSF contributions,
 * withholding tax. Pure functions, all in riel. Tested by scripts/test-tax.mts.
 */
import {
  DEPENDENT_ALLOWANCE, FRINGE_BENEFIT_RATE, NON_RESIDENT_RATE, NSSF_RULES, PENSION_DEDUCTIBLE, PENSION_FUND_FREE_PCT, SALARY_BANDS, SENIORITY_EXEMPT_HALF,
  SENIORITY_EXEMPT_YEAR, type NssfRule,
} from './rates.ts'

export interface Band {
  from: number
  to: number
  rate: number
  taxable: number
  tax: number
}

export interface SalaryTaxResult {
  base: number // taxable salary after the pension contribution and allowances
  pension: number // employee NSSF pension contribution taken off before tax
  allowances: number
  tax: number
  bands: Band[]
  effectiveRate: number // % of gross
}

/**
 * Tax on Salary for one month. `gross` = salary + taxable allowances, in riel.
 * Base = gross − employee NSSF pension contribution − dependent allowances (residents only).
 */
export function salaryTax(gross: number, opts: { resident: boolean; children: number; spouse: boolean; pensionEmployee?: number }): SalaryTaxResult {
  const pension = PENSION_DEDUCTIBLE ? Math.max(0, opts.pensionEmployee ?? 0) : 0
  if (!opts.resident) {
    const base = Math.max(0, gross - pension)
    const tax = Math.round((base * NON_RESIDENT_RATE) / 100)
    return { base, pension, allowances: 0, tax, bands: [{ from: 0, to: Infinity, rate: NON_RESIDENT_RATE, taxable: base, tax }], effectiveRate: gross ? (tax / gross) * 100 : 0 }
  }
  const allowances = DEPENDENT_ALLOWANCE * (Math.max(0, Math.floor(opts.children)) + (opts.spouse ? 1 : 0))
  const base = Math.max(0, gross - pension - allowances)
  const bands: Band[] = []
  let from = 0
  let tax = 0
  for (const b of SALARY_BANDS) {
    const taxable = Math.max(0, Math.min(base, b.upTo) - from)
    const t = (taxable * b.rate) / 100
    bands.push({ from, to: b.upTo, rate: b.rate, taxable, tax: Math.round(t) })
    tax += t
    from = b.upTo
    if (base <= b.upTo) break
  }
  tax = Math.round(tax)
  return { base, pension, allowances, tax, bands, effectiveRate: gross ? (tax / gross) * 100 : 0 }
}

/** Seniority indemnity paid this month: the exempt part (4,000,000 ៛ a year, or 2,000,000 ៛ each time when paid twice a year) and the taxable rest. */
export function seniority(amount: number, timesPerYear: 1 | 2) {
  const cap = timesPerYear === 2 ? SENIORITY_EXEMPT_HALF : SENIORITY_EXEMPT_YEAR
  const exempt = Math.min(Math.max(0, amount), cap)
  return { exempt, taxable: Math.max(0, amount) - exempt, cap }
}

/** Employer contribution to a (private) pension fund: up to 10% of the monthly salary is free, the rest is a fringe benefit. */
export function pensionFundExcess(contribution: number, salary: number) {
  const free = Math.round((Math.max(0, salary) * PENSION_FUND_FREE_PCT) / 100)
  return { free, excess: Math.max(0, Math.max(0, contribution) - free) }
}

export function fringeBenefitTax(value: number): number {
  return Math.round((Math.max(0, value) * FRINGE_BENEFIT_RATE) / 100)
}

export function nssfRule(month: string): NssfRule {
  let rule = NSSF_RULES[0]
  for (const r of NSSF_RULES) if (month >= r.from) rule = r
  return rule
}

export interface NssfResult {
  rule: NssfRule
  base: number // contributory wage (clamped to the min/max)
  occupationalRisk: number
  healthCare: number
  pensionEmployer: number
  pensionEmployee: number
  employerTotal: number
}

/** NSSF contributions for one month's wage. `month` = 'YYYY-MM' (decides which rule applies). */
export function nssf(wage: number, month: string): NssfResult {
  const rule = nssfRule(month)
  const base = Math.min(rule.maxWage, Math.max(rule.minWage, wage))
  const pct = (r: number) => Math.round((base * r) / 100)
  const occupationalRisk = pct(rule.occupationalRisk)
  const healthCare = pct(rule.healthCare)
  const pensionEmployer = pct(rule.pensionEmployer)
  const pensionEmployee = pct(rule.pensionEmployee)
  return { rule, base, occupationalRisk, healthCare, pensionEmployer, pensionEmployee, employerTotal: occupationalRisk + healthCare + pensionEmployer }
}

export interface PayrollInput {
  gross: number // monthly salary in riel
  month: string // 'YYYY-MM'
  resident: boolean
  children: number
  spouse: boolean
  fringe: number // value of fringe benefits (riel), employer pays FBT
  nssfCovered: boolean
  bonus?: number // bonus, overtime, commission paid this month: taxed in the month paid
  seniority?: number // seniority indemnity paid this month
  seniorityTimes?: 1 | 2 // paid once or twice a year
  pensionFund?: number // employer contribution to a private pension fund this month
}

export interface PayrollResult {
  taxable: number // salary + bonus + taxable part of the seniority pay
  tax: SalaryTaxResult
  nssf: NssfResult | null
  seniority: { exempt: number; taxable: number; cap: number }
  pensionFund: { free: number; excess: number }
  fringeTotal: number // fringe benefits + pension fund above 10%
  fbt: number
  net: number // what the employee receives
  employerCost: number // salary + bonus + seniority + employer NSSF + pension fund + fringe + FBT
}

export function payroll(i: PayrollInput): PayrollResult {
  const bonus = Math.max(0, i.bonus ?? 0)
  const sen = seniority(i.seniority ?? 0, i.seniorityTimes ?? 2)
  const pf = pensionFundExcess(i.pensionFund ?? 0, i.gross)
  // NSSF contributions follow the monthly wage (salary); the bonus counts too when paid with it
  const n = i.nssfCovered ? nssf(i.gross + bonus, i.month) : null
  const taxable = i.gross + bonus + sen.taxable
  const tax = salaryTax(taxable, { resident: i.resident, children: i.children, spouse: i.spouse, pensionEmployee: n?.pensionEmployee })
  const fringeTotal = Math.max(0, i.fringe) + pf.excess
  const fbt = fringeBenefitTax(fringeTotal)
  const paid = i.gross + bonus + Math.max(0, i.seniority ?? 0)
  const net = paid - tax.tax - (n?.pensionEmployee ?? 0)
  return { taxable, tax, nssf: n, seniority: sen, pensionFund: pf, fringeTotal, fbt, net, employerCost: paid + (n?.employerTotal ?? 0) + Math.max(0, i.pensionFund ?? 0) + Math.max(0, i.fringe) + fbt }
}

/**
 * Salary needed for the employee to take home `net` each month from the salary alone
 * (bonus and seniority pay, if any, come on top). Riel, found by bisection.
 */
export function grossForNet(net: number, i: Omit<PayrollInput, 'gross'>): number {
  if (net <= 0) return 0
  const regular = { ...i, bonus: 0, seniority: 0 }
  let lo = 0
  let hi = net * 2 + 1_000_000
  while (payroll({ ...regular, gross: hi }).net < net) hi *= 2
  for (let k = 0; k < 60 && hi - lo > 1; k++) {
    const mid = Math.floor((lo + hi) / 2)
    if (payroll({ ...regular, gross: mid }).net >= net) hi = mid
    else lo = mid
  }
  return Math.ceil(hi / 100) * 100 // a salary on the 100 ៛ note that gives at least `net`
}

/** Withholding tax: from the gross payment, or grossed up from the net amount the payee must receive. */
export function withholding(amount: number, ratePct: number, mode: 'gross' | 'net') {
  const r = ratePct / 100
  if (mode === 'gross') {
    const tax = Math.round(amount * r)
    return { gross: amount, tax, net: amount - tax }
  }
  const gross = Math.round(amount / (1 - r))
  return { gross, tax: gross - amount, net: amount }
}
