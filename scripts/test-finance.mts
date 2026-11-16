// Financial calculator tests.  node scripts/test-finance.mts
import { loan, savings, profitFromPrice, priceForMargin, priceForMarkup, breakEven, irr } from '../src/tools/finance/calc.ts'

let failures = 0
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

// $10,000 at 12%/year for 12 months: textbook annuity payment = $888.49
const a = loan({ amount: 1_000_000, currency: 'USD', rate: 12, rateUnit: 'year', months: 12, method: 'annuity' })
check('annuity payment $888.49', a.firstPayment === 88_849, a.firstPayment)
check('annuity pays off exactly', a.rows.at(-1)!.balance === 0 && a.rows.reduce((s, r) => s + r.principal, 0) === 1_000_000)
check('annuity total interest ≈ $661.85', near(a.totalInterest, 66_185, 5), a.totalInterest)
check('no fee: effective monthly = 1%', near(a.effMonthly, 1, 0.001), a.effMonthly)
check('effective annual ≈ 12.68%', near(a.effAnnual, 12.6825, 0.01), a.effAnnual)

// Equal principal: 12,000,000 ៛ at 1.5%/month, 12 months
const p = loan({ amount: 12_000_000, currency: 'KHR', rate: 1.5, rateUnit: 'month', months: 12, method: 'principal' })
check('equal principal: first = 1,000,000 + 180,000', p.firstPayment === 1_180_000, p.firstPayment)
check('equal principal: last = 1,000,000 + 15,000', p.lastPayment === 1_015_000, p.lastPayment)
check('equal principal: total interest 1,170,000 ៛', p.totalInterest === 1_170_000, p.totalInterest)
check('riel payments are whole 100 ៛', p.rows.every((r) => r.payment % 100 === 0))

// Flat rate 1.5%/month: same payment every month, much higher true cost
const f = loan({ amount: 12_000_000, currency: 'KHR', rate: 1.5, rateUnit: 'month', months: 12, method: 'flat' })
check('flat: payment 1,180,000 every month', f.rows.every((r) => r.payment === 1_180_000))
check('flat: total interest 2,160,000 ៛', f.totalInterest === 2_160_000, f.totalInterest)
check('flat 1.5% costs ≈ 2.7%/month declining-equivalent', near(f.effMonthly, 2.7, 0.15), f.effMonthly)

// Upfront fee raises the true rate
const fee = loan({ amount: 1_000_000, currency: 'USD', rate: 12, rateUnit: 'year', months: 12, method: 'annuity', feePct: 2 })
check('2% fee deducted at start', fee.fee === 20_000 && fee.received === 980_000)
check('fee raises effective rate above 1%/month', fee.effMonthly > 1.3 && fee.effMonthly < 1.35, fee.effMonthly)

// Dates: month-end handling
const d = loan({ amount: 300_000, currency: 'USD', rate: 0, rateUnit: 'month', months: 3, method: 'annuity', start: '2026-01-31' })
check('0% loan splits evenly', d.rows.every((r) => r.payment === 100_000 && r.interest === 0))
check('due dates clamp to month end', d.rows.map((r) => r.date).join() === '2026-02-28,2026-03-31,2026-04-30', d.rows.map((r) => r.date))

// IRR sanity
check('irr of 100 → 110 after 1 period = 10%', near(irr([-100, 110]), 0.1, 1e-9))

// Savings: $1,000 at 6%/year for 12 months, no deposits = 1000 × 1.005^12 = 1061.68
const s = savings({ initial: 100_000, monthly: 0, rate: 6, months: 12 })
check('savings compound monthly', s.final === 106_168, s.final)
const s2 = savings({ initial: 0, monthly: 10_000, rate: 0, months: 12 })
check('deposits only: 12 × $100', s2.final === 120_000 && s2.deposited === 120_000)
const s3 = savings({ initial: 100_000, monthly: 0, rate: 6, months: 12, taxPct: 10 })
check('tax withheld = 10% of gross interest', near(s3.tax, s3.interest * 0.1, 1), s3)
check('final = initial + net interest', near(s3.final, 100_000 + s3.net, 1) && s3.final < s.final)

// Price & profit
const pr = profitFromPrice(3_000, 5_000)
check('margin 40%, markup 66.7%', near(pr.margin, 40, 1e-9) && near(pr.markup, 66.666, 0.01))
check('price for 40% margin on 3,000 ៛ = 5,000 ៛', priceForMargin(3_000, 40, 100).price === 5_000)
check('price rounds UP to 100 ៛', priceForMargin(3_100, 40, 100).price === 5_200, priceForMargin(3_100, 40, 100).price)
check('price for 50% markup on $2.00 = $3.00', priceForMarkup(200, 50, 1).price === 300)

// Break-even: rent etc. 3,000,000 ៛/month, coffee 5,000 ៛, ingredients 2,000 ៛, 30 days
const b = breakEven(3_000_000, 5_000, 2_000, 30)
check('break-even 1,000 cups/month, 34/day', b.unitsMonth === 1_000 && b.unitsDay === 34, b)
check('impossible when price ≤ cost', !breakEven(1_000, 2_000, 2_000, 30).possible)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
