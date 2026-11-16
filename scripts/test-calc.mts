// Useful calculator tests.  node scripts/test-calc.mts
import { change, cashTotal, vat, discount, unitPrices } from '../src/tools/calc/calc.ts'

let failures = 0
const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

// Bill 26,500 ៛, customer pays $10 at 4,100 = 41,000 ៛ → change 14,500 ៛ = $3 + 2,200 ៛
const c = change({ due: 26_500, dueCurrency: 'KHR', paidUsd: 1_000, paidKhr: 0, rate: 4_100 })
check('change all in riel = 14,500 ៛', c.changeRiel === 14_500, c)
check('or $3 + 2,200 ៛', c.mixUsd === 3 && c.mixRiel === 2_200, c)
// Bill $7.25 (= 29,725 ៛ → 29,700), pays $5 + 10,000 ៛ = 30,500 ៛ → change 800 ៛ (rounded)
const c2 = change({ due: 725, dueCurrency: 'USD', paidUsd: 500, paidKhr: 10_000, rate: 4_100 })
check('mixed payment change rounds to 100 ៛', c2.changeRiel === 800 && c2.mixUsd === 0, c2)
const c3 = change({ due: 50_000, dueCurrency: 'KHR', paidUsd: 1_000, paidKhr: 0, rate: 4_000 })
check('short payment detected (owes 10,000 ៛)', c3.short && c3.diffRiel === -10_000, c3)

const cash = cashTotal({ riel: { 100_000: 2, 10_000: 3, 500: 4 }, usd: { 20: 1, 1: 5 } }, 4_000)
check('cash count riel 232,000', cash.riel === 232_000, cash)
check('cash count $25 → total 332,000 ៛', cash.usd === 25 && cash.totalRiel === 332_000, cash)
check('notes counted = 15', cash.notes === 15)

check('add 10% VAT to 10,000 = 11,000', vat(10_000, 10, 'add').gross === 11_000)
const v = vat(11_000, 10, 'remove')
check('remove VAT from 11,000 → 10,000 + 1,000', v.net === 10_000 && v.tax === 1_000, v)

const d = discount(20_000, { kind: 'pct', value: 10 }, { kind: 'pct', value: 10 })
check('10% then 10% = 16,200 (19% off, not 20%)', d.final === 16_200 && near(d.pct, 19, 1e-9), d)
check('fixed discount never below zero', discount(1_000, { kind: 'amount', value: 5_000 }).final === 0)

const u = unitPrices([
  { price: 2_500, qty: 330 },
  { price: 6_000, qty: 1_000 },
  { price: 0, qty: 500 },
])
check('cheapest per unit is the 1 L pack', u[1].best && !u[0].best && !Number.isFinite(u[2].perUnit), u)
check('can is ~26% more expensive per ml', near(u[0].moreThanBestPct, 26.26, 0.1), u[0])

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
