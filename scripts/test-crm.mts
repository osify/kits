// Customers (CRM) data tests.  node scripts/test-crm.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { CRM_MIGRATIONS } from '../src/tools/crm/db/schema.ts'
import {
  saveCustomer, listCustomers, addLedger, addFollowup, completeFollowup, dueFollowups, timeline, totalsOwed,
  birthdaysSoon, exportCsv, importCsv, parseCsv, allTags, getCustomer, addActivity,
} from '../src/tools/crm/db/data.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of CRM_MIGRATIONS) raw.exec(m.sql)
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

const D = 'dev'
const sokha = await saveCustomer(db, { name: 'Sokha', phone: '012 345 678', telegram: '@sokha', tags: 'VIP, Wholesale', birthday: '11-20' })
const dara = await saveCustomer(db, { name: 'Dara', tags: 'Wholesale' })
await saveCustomer(db, { name: 'Bopha', birthday: '1990-01-05' })

check('telegram @ is stripped', (await getCustomer(db, sokha))!.telegram === 'sokha')
check('tags are collected', JSON.stringify(await allTags(db)) === '["VIP","Wholesale"]', await allTags(db))
check('filter by tag', (await listCustomers(db, { tag: 'Wholesale' })).length === 2)
check('search by phone', (await listCustomers(db, { search: '345' }))[0]?.name === 'Sokha')

await addLedger(db, sokha, 'CHARGE', 'KHR', 50_000, '2026-11-01', 'goods', D)
await addLedger(db, sokha, 'CHARGE', 'USD', 2_000, '2026-11-02', '', D)
await addLedger(db, sokha, 'PAYMENT', 'KHR', 20_000, '2026-11-10', 'cash', D)
const s = (await getCustomer(db, sokha))!
check('balances kept per currency: 30,000 ៛ and $20', s.owe_khr === 30_000 && s.owe_usd === 2_000, s)
const owed = await totalsOwed(db)
check('totals owed across customers', owed.khr === 30_000 && owed.usd === 2_000 && owed.customers === 1, owed)
check('sort by owed puts Sokha first', (await listCustomers(db, { sort: 'owed' }))[0].name === 'Sokha')
let threw = ''
try { await addLedger(db, dara, 'CHARGE', 'KHR', 0, '2026-11-01', '', D) } catch (e: any) { threw = e.message }
check('zero amount refused', threw === 'AMOUNT')

await addFollowup(db, sokha, '2026-11-15', 'Ask about the order', D)
await addFollowup(db, dara, '2026-11-20', 'Deliver', D)
const due = await dueFollowups(db, '2026-11-16')
check('due list shows overdue only up to today', due.length === 1 && due[0].name === 'Sokha', due)
check('next follow-up date on the customer', (await getCustomer(db, dara))!.next_due === '2026-11-20')
await completeFollowup(db, due[0].id, D)
check('done follow-up leaves the due list', (await dueFollowups(db, '2026-11-16')).length === 0)

await addActivity(db, dara, 'CALL', '2026-11-12', 'Called about prices', D)
const tl = await timeline(db, sokha)
check('timeline mixes debts, follow-ups and notes', tl.some((x) => x.type === 'ledger') && tl.some((x) => x.type === 'followup' && x.done_at) && tl.some((x) => x.type === 'activity'), tl.map((x) => x.type))
check('recent sort uses last activity', (await listCustomers(db, { sort: 'recent' }))[0].name === 'Sokha')

const bd = await birthdaysSoon(db, new Date(2026, 10, 16), 14)
check('birthday in 4 days found, January one not', bd.length === 1 && bd[0].name === 'Sokha' && bd[0].inDays === 4, bd.map((b) => [b.name, b.inDays]))
const bdWrap = await birthdaysSoon(db, new Date(2026, 11, 28), 14)
check('birthday across New Year (Jan 5 from Dec 28 = 8 days)', bdWrap.some((b) => b.name === 'Bopha' && b.inDays === 8), bdWrap.map((b) => [b.name, b.inDays]))

const csv = await exportCsv(db)
check('CSV export has header + 3 customers', csv.startsWith('﻿') && parseCsv(csv).length === 4)
check('CSV parser handles quotes and commas', JSON.stringify(parseCsv('name,note\r\n"Lim, Co","say ""hi"""\n')) === JSON.stringify([['name', 'note'], ['Lim, Co', 'say "hi"']]))
const imp = await importCsv(db, 'Name,Phone,Tags\nSokha,1,\nChan Thy,099 111 222,"VIP"\n,,\n')
check('import adds new, skips existing (blank lines ignored)', imp.added === 1 && imp.skipped === 1, imp)
check('imported customer has tag', (await listCustomers(db, { tag: 'VIP' })).some((c) => c.name === 'Chan Thy'))

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
