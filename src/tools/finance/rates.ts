/**
 * Cambodian tax & social-security parameters used by the calculators.
 * ⚠ Rates change by law / prakas. Update this file (and CHECKED) when they do; the screens
 * show CHECKED and the sources. All amounts in riel.
 */
export const CHECKED = '2026-11-16'

export const SOURCES = [
  { label: 'GDT Tax on Salary (resident brackets, 150,000 ៛ allowances)', url: 'https://cambodia.acclime.com/guides/personal-income-tax/' },
  { label: 'NSSF Prakas 234/26: wage base 600,000–1,500,000 ៛', url: 'https://www.hrforte.com/taxtok-hrforte/cambodia-nssf-ceiling-rises-to-khr-1.5-million-what-changes-on-your-payroll' },
  { label: 'NSSF profile (pension phases)', url: 'https://www.asean-ssa.org/files/Organisation%20Profiles/CambodiaNSSFProfile.pdf' },
  { label: 'Withholding tax rates', url: 'https://emerhub.com/cambodia/withholding-tax-in-cambodia/' },
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
/** Employee NSSF pension contributions do not reduce the salary-tax base (per most guidance; confirm with GDT). */
export const PENSION_DEDUCTIBLE = false

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
