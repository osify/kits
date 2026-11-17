// Cambodian payroll & tax tests.  node scripts/test-tax.mts
import { salaryTax, nssf, payroll, withholding, fringeBenefitTax, nssfRule, seniority, pensionFundExcess, grossForNet } from '../src/tools/finance/tax.ts'

let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
const R = { resident: true, children: 0, spouse: false }

check('1,500,000 ៛ is tax-free', salaryTax(1_500_000, R).tax === 0)
check('5,000,000 ៛ → 25,000 + 300,000 = 325,000', salaryTax(5_000_000, R).tax === 325_000, salaryTax(5_000_000, R))
check('2 children → base −300,000 → 295,000', salaryTax(5_000_000, { ...R, children: 2 }).tax === 295_000)
check('spouse counts as one allowance', salaryTax(5_000_000, { ...R, spouse: true }).allowances === 150_000)
check('20,000,000 ៛ → 25k + 650k + 600k + 1.5M = 2,775,000', salaryTax(20_000_000, R).tax === 2_775_000, salaryTax(20_000_000, R).tax)
check('non-resident flat 20%, no allowances', salaryTax(5_000_000, { resident: false, children: 3, spouse: true }).tax === 1_000_000)
check('allowances never make the base negative', salaryTax(200_000, { ...R, children: 5 }).base === 0)
check('fringe benefit tax 20%', fringeBenefitTax(1_000_000) === 200_000)

const top = nssf(4_000_000, '2026-11')
check('Nov 2026 ceiling 1,500,000 ៛', top.base === 1_500_000)
check('employer max 81,000 ៛ (12,000 + 39,000 + 30,000)', top.employerTotal === 81_000 && top.occupationalRisk === 12_000 && top.healthCare === 39_000, top)
check('employee pension max 30,000 ៛', top.pensionEmployee === 30_000)
check('before Nov 2026 the ceiling was 1,200,000 ៛ (employee 24,000)', nssf(4_000_000, '2026-10').pensionEmployee === 24_000)
check('low wage uses the 600,000 ៛ floor', nssf(300_000, '2026-12').base === 600_000)
check('scheduled pension phase 2 from Oct 2027 (4%)', nssfRule('2027-10').pensionEmployee === 4)

const p = payroll({ gross: 5_000_000, month: '2026-11', resident: true, children: 0, spouse: false, fringe: 0, nssfCovered: true })
check('pension 30,000 comes off before tax: base 4,970,000 → tax 322,000', p.tax.base === 4_970_000 && p.tax.pension === 30_000 && p.tax.tax === 322_000, p.tax)
check('net pay = 5,000,000 − 322,000 tax − 30,000 pension', p.net === 4_648_000, p.net)
check('employer cost = salary + 81,000 NSSF', p.employerCost === 5_081_000, p.employerCost)

// GDT National School of Taxation, Tax on Salary 2023: worked examples (no NSSF in them)
check('slide 20: 2,500,000 ៛ resident → 75,000', salaryTax(2_500_000, R).tax === 75_000)
check('slide 20: spouse + 3 children → base 1,900,000 → 20,000', salaryTax(2_500_000, { ...R, spouse: true, children: 3 }).tax === 20_000)
check('slide 22: non-resident 10,000,000 ៛ → 2,000,000', salaryTax(10_000_000, { resident: false, children: 2, spouse: true }).tax === 2_000_000)
const s37 = payroll({ gross: 9_000_000, bonus: 2_000_000, month: '2026-11', resident: true, children: 0, spouse: false, fringe: 1_200_000, nssfCovered: false })
check('slide 37: salary 9M + bonus 2M → tax 1,050,000; fringe 1.2M → FBT 240,000', s37.tax.tax === 1_050_000 && s37.fbt === 240_000, { tax: s37.tax.tax, fbt: s37.fbt })
check('non-resident: pension also off the base (20% of 4,970,000)', salaryTax(5_000_000, { resident: false, children: 0, spouse: false, pensionEmployee: 30_000 }).tax === 994_000)

// seniority indemnity (exempt 4,000,000 ៛ a year / 2,000,000 ៛ each time when paid twice)
check('seniority 2,500,000 paid twice a year → 500,000 taxable', seniority(2_500_000, 2).taxable === 500_000 && seniority(2_500_000, 2).exempt === 2_000_000)
check('seniority 3,000,000 paid once a year → all exempt', seniority(3_000_000, 1).taxable === 0)
const ps = payroll({ gross: 5_000_000, seniority: 2_500_000, seniorityTimes: 2, month: '2026-12', resident: true, children: 0, spouse: false, fringe: 0, nssfCovered: true })
check('payroll: seniority excess taxed, whole seniority paid', ps.taxable === 5_500_000 && ps.net === 7_500_000 - ps.tax.tax - 30_000, ps)

// pension fund above 10% of salary = fringe benefit
check('pension fund: 10% of 5M free, 700,000 → 200,000 excess', pensionFundExcess(700_000, 5_000_000).excess === 200_000)
const pf = payroll({ gross: 5_000_000, pensionFund: 700_000, month: '2026-11', resident: true, children: 0, spouse: false, fringe: 0, nssfCovered: false })
check('payroll: pension fund excess → FBT 40,000, employer pays the fund', pf.fbt === 40_000 && pf.employerCost === 5_740_000, pf)

// net → gross
const want = 4_648_000
const g = grossForNet(want, { month: '2026-11', resident: true, children: 0, spouse: false, fringe: 0, nssfCovered: true })
check('gross for net 4,648,000 = 5,000,000', g === 5_000_000, g)
const g2 = grossForNet(3_333_333, { month: '2026-11', resident: true, children: 1, spouse: true, fringe: 0, nssfCovered: true })
const n2 = payroll({ gross: g2, month: '2026-11', resident: true, children: 1, spouse: true, fringe: 0, nssfCovered: true }).net
check('gross for net: lowest 100 ៛ salary that gives at least the net', n2 >= 3_333_333 && payroll({ gross: g2 - 100, month: '2026-11', resident: true, children: 1, spouse: true, fringe: 0, nssfCovered: true }).net < 3_333_333, { g2, n2 })

check('gross for net ignores bonus/seniority (they come on top)', grossForNet(4_648_000, { month: '2026-11', resident: true, children: 0, spouse: false, fringe: 0, nssfCovered: true, seniority: 2_500_000, bonus: 1_000_000 }) === 5_000_000)
check('rent 10% withholding on 1,000,000', withholding(1_000_000, 10, 'gross').tax === 100_000)
const up = withholding(860_000, 14, 'net')
check('gross-up: landlord must receive 860,000 → pay 1,000,000 gross', up.gross === 1_000_000 && up.tax === 140_000, up)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
