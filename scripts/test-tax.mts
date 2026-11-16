// Cambodian payroll & tax tests.  node scripts/test-tax.mts
import { salaryTax, nssf, payroll, withholding, fringeBenefitTax, nssfRule } from '../src/tools/finance/tax.ts'

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
check('net pay = 5,000,000 − 325,000 tax − 30,000 pension', p.net === 4_645_000, p.net)
check('employer cost = salary + 81,000 NSSF', p.employerCost === 5_081_000, p.employerCost)

check('rent 10% withholding on 1,000,000', withholding(1_000_000, 10, 'gross').tax === 100_000)
const up = withholding(860_000, 14, 'net')
check('gross-up: landlord must receive 860,000 → pay 1,000,000 gross', up.gross === 1_000_000 && up.tax === 140_000, up)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
