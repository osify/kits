/**
 * Cambodian payroll calculations: GDT Tax on Salary, Fringe Benefit Tax, NSSF contributions,
 * withholding tax. Pure functions, all in riel. Tested by scripts/test-tax.mts.
 */
import { DEPENDENT_ALLOWANCE, FRINGE_BENEFIT_RATE, NON_RESIDENT_RATE, NSSF_RULES, PENSION_DEDUCTIBLE, SALARY_BANDS, type NssfRule } from './rates.ts'

export interface Band {
  from: number
  to: number
  rate: number
  taxable: number
  tax: number
}

export interface SalaryTaxResult {
  base: number // taxable salary after allowances
  allowances: number
  tax: number
  bands: Band[]
  effectiveRate: number // % of gross
}

/** Tax on Salary for one month. `gross` = salary + taxable allowances, in riel. */
export function salaryTax(gross: number, opts: { resident: boolean; children: number; spouse: boolean; pensionEmployee?: number }): SalaryTaxResult {
  if (!opts.resident) {
    const tax = Math.round((gross * NON_RESIDENT_RATE) / 100)
    return { base: gross, allowances: 0, tax, bands: [{ from: 0, to: Infinity, rate: NON_RESIDENT_RATE, taxable: gross, tax }], effectiveRate: gross ? (tax / gross) * 100 : 0 }
  }
  const allowances = DEPENDENT_ALLOWANCE * (Math.max(0, Math.floor(opts.children)) + (opts.spouse ? 1 : 0))
  const base = Math.max(0, gross - allowances - (PENSION_DEDUCTIBLE ? (opts.pensionEmployee ?? 0) : 0))
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
  return { base, allowances, tax, bands, effectiveRate: gross ? (tax / gross) * 100 : 0 }
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
}

export interface PayrollResult {
  tax: SalaryTaxResult
  nssf: NssfResult | null
  fbt: number
  net: number // what the employee receives
  employerCost: number // salary + employer NSSF + fringe + FBT
}

export function payroll(i: PayrollInput): PayrollResult {
  const n = i.nssfCovered ? nssf(i.gross, i.month) : null
  const tax = salaryTax(i.gross, { resident: i.resident, children: i.children, spouse: i.spouse, pensionEmployee: n?.pensionEmployee })
  const fbt = fringeBenefitTax(i.fringe)
  const net = i.gross - tax.tax - (n?.pensionEmployee ?? 0)
  return { tax, nssf: n, fbt, net, employerCost: i.gross + (n?.employerTotal ?? 0) + i.fringe + fbt }
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
