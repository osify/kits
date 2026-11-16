// Income & Expense data tests (in-memory SQLite, real schema).  node scripts/test-money.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { MONEY_MIGRATIONS } from '../src/tools/money/db/schema.ts'
import { setupBook, balances, saveTxn, totals, byCategory, byMonth, listCategories, exportCsv, deleteTxn } from '../src/tools/money/db/data.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of MONEY_MIGRATIONS) raw.exec(m.sql)
const db: DbLike = {
  async query(sql, bind) {
    return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
  },
  async get(sql, bind) {
    return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })[0]
  },
  async run(sql, bind) {
    raw.exec({ sql, bind })
    return raw.changes()
  },
  async batch(stmts) {
    let n = 0
    raw.transaction(() => {
      for (const s of stmts) {
        raw.exec({ sql: s.sql, bind: s.bind })
        n += raw.changes()
      }
    })
    return n
  },
}

let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

await setupBook(db, 'LomOr', 'KHR', 4000, [
  { name: 'Cash ៛', kind: 'CASH', currency: 'KHR', opening: 200_000 },
  { name: 'Cash $', kind: 'CASH', currency: 'USD', opening: 5_000 },
  { name: 'ABA', kind: 'BANK', currency: 'USD', opening: 0 },
])
const acc = await balances(db)
const cashR = acc.find((a) => a.name === 'Cash ៛')!
const cashD = acc.find((a) => a.name === 'Cash $')!
const aba = acc.find((a) => a.name === 'ABA')!
const cats = await listCategories(db)
const sales = cats.find((c) => c.name === 'Sales')!
const rent = cats.find((c) => c.name === 'Rent')!
const stock = cats.find((c) => c.name === 'Stock & ingredients')!
check('default categories created', cats.length >= 18)

const R = 4000
await saveTxn(db, { kind: 'IN', date: '2026-11-01', account_id: cashR.id, category_id: sales.id, amount: 500_000, khr_per_usd: R }, 'D')
await saveTxn(db, { kind: 'IN', date: '2026-11-02', account_id: aba.id, category_id: sales.id, amount: 10_000, khr_per_usd: R }, 'D') // $100
await saveTxn(db, { kind: 'OUT', date: '2026-11-03', account_id: cashD.id, category_id: rent.id, amount: 15_000, khr_per_usd: R }, 'D') // $150
await saveTxn(db, { kind: 'OUT', date: '2026-11-04', account_id: cashR.id, category_id: stock.id, amount: 120_000, khr_per_usd: R }, 'D')
// transfer: 40,000 ៛ cash → ABA as $10
await saveTxn(db, { kind: 'MOVE', date: '2026-11-05', account_id: cashR.id, to_account_id: aba.id, amount: 40_000, to_amount: 1_000, khr_per_usd: R }, 'D')
await saveTxn(db, { kind: 'IN', date: '2026-10-15', account_id: cashR.id, category_id: sales.id, amount: 300_000, khr_per_usd: R }, 'D')

const b = Object.fromEntries((await balances(db)).map((a) => [a.name, a.balance]))
check('cash ៛ = 200k + 300k + 500k − 120k − 40k', b['Cash ៛'] === 840_000, b)
check('cash $ = $50 − $150 = −$100', b['Cash $'] === -10_000, b)
check('ABA = $100 + $10 transfer', b['ABA'] === 11_000, b)

const nov = await totals(db, '2026-11-01', '2026-11-30', 'KHR')
check('Nov income in riel = 500,000 + $100×4000', nov.income === 900_000, nov)
check('Nov expense in riel = $150×4000 + 120,000', nov.expense === 720_000, nov)
check('Nov profit = 180,000 ៛', nov.net === 180_000, nov)
check('transfers are not income or expense', nov.count === 4, nov)
const novUsd = await totals(db, '2026-11-01', '2026-11-30', 'USD')
check('same month in USD: income $225, expense $180', novUsd.income === 22_500 && novUsd.expense === 18_000, novUsd)

const cat = await byCategory(db, '2026-11-01', '2026-11-30', 'KHR')
check('expense by category: rent 600,000 ៛ first', cat.filter((c) => c.kind === 'OUT')[0].name === 'Rent' && cat.filter((c) => c.kind === 'OUT')[0].total === 600_000, cat)

const months = await byMonth(db, 2026, 'KHR')
check('two months with data', months.length === 2 && months[0].month === '2026-10' && months[0].income === 300_000, months)

let threw = ''
try {
  await saveTxn(db, { kind: 'MOVE', date: '2026-11-06', account_id: aba.id, to_account_id: aba.id, amount: 100, khr_per_usd: R }, 'D')
} catch (e: any) {
  threw = e.message
}
check('transfer to the same account is refused', threw === 'TO_ACCOUNT')
threw = ''
try {
  await saveTxn(db, { kind: 'OUT', date: '2026-11-06', account_id: aba.id, amount: 0, khr_per_usd: R }, 'D')
} catch (e: any) {
  threw = e.message
}
check('zero amount is refused', threw === 'AMOUNT')

const csv = await exportCsv(db, '2026-11-01', '2026-11-30')
check('CSV has BOM, header and 5 rows', csv.startsWith('﻿') && csv.trim().split('\r\n').length === 6 && csv.includes('ការលក់'), csv.split('\r\n').length)

const id = (await db.get<{ id: string }>(`SELECT id FROM txn WHERE amount = 120000`))!.id
await deleteTxn(db, id)
check('deleting an expense restores the balance', (await balances(db)).find((a) => a.name === 'Cash ៛')!.balance === 960_000)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
