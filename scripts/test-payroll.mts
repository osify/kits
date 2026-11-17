// Payroll (monthly return for all staff) tests.  node scripts/test-payroll.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { PAYROLL_MIGRATIONS } from '../src/tools/payroll/db/schema.ts'
import {
  setupBook, saveStaff, listStaff, getStaff, deleteStaff, startRun, getRun, listLines, missingStaff, addToRun, removeFromRun, updateLine, setRunRate,
  refreshFromStaff, closeRun, reopenRun, deleteRun, returnSummary, yearReport, monthCsv, netIn,
} from '../src/tools/payroll/db/data.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of PAYROLL_MIGRATIONS) raw.exec(m.sql)
const db: DbLike = {
  async query(sql, bind) { return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' }) },
  async get(sql, bind) { return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })[0] },
  async run(sql, bind) { raw.exec({ sql, bind }); return raw.changes() },
  async batch(stmts) { let n = 0; raw.transaction(() => { for (const s of stmts) { raw.exec({ sql: s.sql, bind: s.bind }); n += raw.changes() } }); return n },
}
let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
async function throws(fn: () => Promise<unknown>, msg: string) {
  try { await fn(); return false } catch (e: any) { return e.message === msg }
}

await setupBook(db, 'Sok Trading', 'KHR', 4_100)
const a = await saveStaff(db, { name: 'Chan Thy', salary: 5_000_000, currency: 'KHR', position: 'Accountant', nationality: 'Khmer', start_date: '2025-01-01' })
const b = await saveStaff(db, { name: 'Kim Leng', salary: 50_000, currency: 'USD', children: 2, spouse: 1, nationality: 'Khmer' }) // $500
const c = await saveStaff(db, { name: 'John Smith', salary: 10_000_000, currency: 'KHR', resident: 0, nssf_covered: 0, nationality: 'British' })
const d = await saveStaff(db, { name: 'Left Already', salary: 2_000_000, currency: 'KHR', end_date: '2026-10-15' })
const e = await saveStaff(db, { name: 'Starts Later', salary: 2_000_000, currency: 'KHR', start_date: '2026-12-01' })
check('staff codes E-001…E-005', (await getStaff(db, a))!.code === 'E-001' && (await getStaff(db, e))!.code === 'E-005')
check('working in Nov 2026: 3 (one left, one starts later)', (await listStaff(db, '2026-11')).length === 3)

await startRun(db, '2026-11', 4_100)
let lines = await listLines(db, '2026-11')
check('start month → one line per working staff', lines.length === 3 && (await getRun(db, '2026-11'))!.status === 'OPEN')
const la = lines.find((l) => l.staff_id === a)!
check('Chan Thy 5,000,000: pension 30,000 off, tax 322,000, net 4,648,000', la.pension_khr === 30_000 && la.tax_khr === 322_000 && la.net_khr === 4_648_000, la)
const lb = lines.find((l) => l.staff_id === b)!
// $500 × 4,100 = 2,050,000; pension 2% of the 1,500,000 ceiling = 30,000; 3 dependants 450,000 → base 1,570,000 → 5% × 70,000 = 3,500
check('Kim Leng $500 at 4,100 → 2,050,000; base 1,570,000; tax 3,500', lb.gross_khr === 2_050_000 && lb.base_khr === 1_570_000 && lb.tax_khr === 3_500, lb)
check('dollar net paid in dollars: 2,016,500 ៛ → $491.83', netIn(lb, 4_100) === 49_183, netIn(lb, 4_100))
const lc = lines.find((l) => l.staff_id === c)!
check('non-resident 20% flat, no NSSF: 2,000,000', lc.tax_khr === 2_000_000 && lc.nssf_risk_khr === 0 && lc.pension_khr === 0)

// this month's extras
await updateLine(db, la.id, { bonus: 1_000_000, fringe: 500_000, deduction: 200_000 })
const la2 = (await listLines(db, '2026-11')).find((l) => l.id === la.id)!
// taxable 6,000,000 − 30,000 = 5,970,000 → 25,000 + 397,000 = 422,000; FBT 100,000; net 6,000,000 − 422,000 − 30,000 − 200,000
check('bonus taxed in the month, fringe → FBT 100,000, deduction after tax', la2.tax_khr === 422_000 && la2.fbt_khr === 100_000 && la2.net_khr === 5_348_000, la2)

// return summary
lines = await listLines(db, '2026-11')
const s = returnSummary(lines, '2026-11')
check('residents: 2 staff, tax 425,500', s.residents.count === 2 && s.residents.tax === 425_500, s.residents)
check('non-residents: 1 staff, tax 2,000,000', s.nonResidents.count === 1 && s.nonResidents.tax === 2_000_000)
check('FBT: 1 staff, 500,000 → 100,000', s.fringe.count === 1 && s.fringe.value === 500_000 && s.fringe.fbt === 100_000)
check('total to GDT = 2,525,500', s.taxTotal === 2_525_500, s.taxTotal)
check('NSSF: 2 covered, each 1,500,000 ceiling → 111,000 × 2', s.nssf.count === 2 && s.nssf.total === 222_000, s.nssf)
check('due 2026-12-20, e-Filing 2026-12-25', s.dueDate === '2026-12-20' && s.eDueDate === '2026-12-25')
check('December return due next January', returnSummary([], '2026-12').dueDate === '2027-01-20')

// exchange rate change recomputes dollar staff
await setRunRate(db, '2026-11', 4_000)
check('rate 4,000 → Kim Leng gross 2,000,000', (await listLines(db, '2026-11')).find((l) => l.staff_id === b)!.gross_khr === 2_000_000)

// staff changes reach an open month on refresh only
await saveStaff(db, { ...(await getStaff(db, a))!, salary: 6_000_000 })
check('staff edit does not change the month by itself', (await listLines(db, '2026-11')).find((l) => l.staff_id === a)!.salary === 5_000_000)
await refreshFromStaff(db, '2026-11')
check('refresh from staff takes the new salary', (await listLines(db, '2026-11')).find((l) => l.staff_id === a)!.salary === 6_000_000)

// add / remove
const newcomer = await saveStaff(db, { name: 'New Hire', salary: 1_200_000, currency: 'KHR', start_date: '2026-11-10' })
check('new hire shows as missing from the month', (await missingStaff(db, '2026-11')).map((x) => x.id).join() === newcomer)
await addToRun(db, '2026-11', newcomer)
const ln = (await listLines(db, '2026-11')).find((l) => l.staff_id === newcomer)!
check('1,200,000 − 24,000 pension → no tax', ln.tax_khr === 0 && ln.pension_khr === 24_000, ln)
await removeFromRun(db, ln.id)
check('removed from the month', (await listLines(db, '2026-11')).length === 3)

// close
await closeRun(db, '2026-11')
check('closed month cannot change', await throws(() => updateLine(db, la.id, { bonus: 1 }), 'CLOSED'))
check('closed month cannot be deleted', await throws(() => deleteRun(db, '2026-11'), 'CLOSED'))
check('staff on a payroll cannot be deleted', await throws(() => deleteStaff(db, a), 'ON_PAYROLL'))
await deleteStaff(db, e)
check('staff never on a payroll can be deleted', !(await getStaff(db, e)))
await reopenRun(db, '2026-11')
check('reopened month can change', (await updateLine(db, la.id, { bonus: 0 }), true))

// year report and CSV
await startRun(db, '2026-12', 4_100)
const y = await yearReport(db, '2026')
check('year report: 2 months', y.length === 2 && y[0].month === '2026-11' && y[0].staff === 3, y)
const csv = await monthCsv(db, '2026-11')
const rows = csv.trim().split('\r\n')
check('CSV: header + 3 staff, riel tax column', rows.length === 4 && rows[0].includes('tax_on_salary_khr') && rows.some((r) => r.includes('John Smith') && r.includes(',2000000,')), rows)
await deleteRun(db, '2026-12')
check('open month can be deleted', !(await getRun(db, '2026-12')))

console.log(failures ? `\n${failures} FAILED` : '\nAll payroll tests passed')
process.exit(failures ? 1 : 0)
