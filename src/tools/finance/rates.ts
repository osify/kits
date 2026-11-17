/**
 * Cambodian tax & social-security parameters used by the calculators.
 * ⚠ Rates change by law / prakas. Update this file (and CHECKED) when they do; the screens
 * show CHECKED and the sources. All amounts in riel.
 */
export const CHECKED = '2026-11-17'

export const SOURCES = [
  { label: 'GDT Tax on Salary (resident brackets, 150,000 ៛ allowances)', url: 'https://cambodia.acclime.com/guides/personal-income-tax/' },
  { label: 'NSSF Prakas 234/26: wage base 600,000–1,500,000 ៛', url: 'https://www.hrforte.com/taxtok-hrforte/cambodia-nssf-ceiling-rises-to-khr-1.5-million-what-changes-on-your-payroll' },
  { label: 'NSSF profile (pension phases)', url: 'https://www.asean-ssa.org/files/Organisation%20Profiles/CambodiaNSSFProfile.pdf' },
  { label: 'Withholding tax rates', url: 'https://emerhub.com/cambodia/withholding-tax-in-cambodia/' },
  { label: 'GDT National School of Taxation: Tax on Salary (2023), tax base = salary − NSSF/labour-law contributions − exempt pay', url: 'https://www.tax.gov.kh' },
  { label: 'GDT: General Department of Taxation', url: 'https://www.tax.gov.kh' },
  { label: 'NSSF: National Social Security Fund', url: 'https://www.nssf.gov.kh' },
]

/** Tax on Salary for residents: monthly progressive bands on the taxable salary. */
export const SALARY_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 1_500_000, rate: 0 },
  { upTo: 2_000_000, rate: 5 },
  { upTo: 8_500_000, rate: 10 },
  { upTo: 12_500_000, rate: 15 },
  { upTo: Infinity, rate: 20 },
]
/** Monthly deduction per dependent child (under 14, or under 25 in full-time study) and for a non-working spouse. */
export const DEPENDENT_ALLOWANCE = 150_000
export const NON_RESIDENT_RATE = 20
export const FRINGE_BENEFIT_RATE = 20
/**
 * Tax base = taxable salary − contributions withheld under the Labour Law and the Social Security
 * Law (the employee's NSSF pension share) − exempt payments (GDT, Tax on Salary 2023, slide 16).
 */
export const PENSION_DEDUCTIBLE = true
/** Seniority indemnity (since 2020, Circular 002 MEF): exempt up to 4,000,000 ៛ a year; paid twice a year, up to 2,000,000 ៛ each time. */
export const SENIORITY_EXEMPT_YEAR = 4_000_000
export const SENIORITY_EXEMPT_HALF = 2_000_000
/** Employer contributions to a pension fund above this % of the monthly salary (without fringe benefits) are a fringe benefit. */
export const PENSION_FUND_FREE_PCT = 10
/** Monthly return and payment: by the 20th of the next month (25th when filed on GDT e-Filing). */
export const FILING_DAY = 20
export const EFILING_DAY = 25

/** NSSF contribution rules by the month they start to apply ('YYYY-MM'). Latest matching entry wins. */
export interface NssfRule {
  from: string
  minWage: number
  maxWage: number
  occupationalRisk: number // employer %
  healthCare: number // employer %
  pensionEmployer: number // %
  pensionEmployee: number // %
  note?: string
}
export const NSSF_RULES: NssfRule[] = [
  { from: '2022-10', minWage: 400_000, maxWage: 1_200_000, occupationalRisk: 0.8, healthCare: 2.6, pensionEmployer: 2, pensionEmployee: 2 },
  { from: '2026-11', minWage: 600_000, maxWage: 1_500_000, occupationalRisk: 0.8, healthCare: 2.6, pensionEmployer: 2, pensionEmployee: 2, note: 'Prakas 234/26' },
  // Pension rate is scheduled to rise after the first 5 years (from Oct 2027: 4% + 4% = 8%). Confirm with NSSF.
  { from: '2027-10', minWage: 600_000, maxWage: 1_500_000, occupationalRisk: 0.8, healthCare: 2.6, pensionEmployer: 4, pensionEmployee: 4, note: 'scheduled pension phase 2 (unconfirmed)' },
]

/** Withholding tax rates (% of the gross payment). */
export const WITHHOLDING = [
  { key: 'rent', rate: 10, resident: true },
  { key: 'services', rate: 15, resident: true },
  { key: 'royalty', rate: 15, resident: true },
  { key: 'interest', rate: 15, resident: true },
  { key: 'fixedDeposit', rate: 6, resident: true },
  { key: 'savings', rate: 4, resident: true },
  { key: 'nonResident', rate: 14, resident: false },
] as const
export type WithholdingKey = (typeof WITHHOLDING)[number]['key']
