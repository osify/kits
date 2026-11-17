// Invoice tests.  node scripts/test-invoice.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { INVOICE_MIGRATIONS } from '../src/tools/invoice/db/schema.ts'
import {
  setupBook, setSetting, saveClient, listClients, deleteClient, saveItem, listItems, createDoc, getDoc, setDocClient, updateDoc, addLine, updateLine, removeLine, moveLine,
  listLines, totals, inRiel, issueInvoice, reopenInvoice, voidInvoice, deleteDoc, quoteToInvoice, duplicateDoc, addPayment, removePayment, listPayments, listDocs,
  outstanding, monthReport, changeCurrency, invoicesCsv, clientsCsv, importClients, docState, shareText, nextNumber,
} from '../src/tools/invoice/db/data.ts'
import { formatMoney } from '../src/core/util/money.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of INVOICE_MIGRATIONS) raw.exec(m.sql)
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

// ── Totals ──
check('riel lines round to 100 ៛', totals([{ qty: 3, price: 333 }], 0, 0, 'KHR').total === 1_000)
const t1 = totals([{ qty: 2, price: 50_000 }, { qty: 1, price: 25_000 }], 5_000, 10, 'KHR')
check('KHR: 125,000 − 5,000 = 120,000 + VAT 12,000 = 132,000', t1.subtotal === 125_000 && t1.taxable === 120_000 && t1.vat === 12_000 && t1.total === 132_000, t1)
const t2 = totals([{ qty: 1, price: 12_345 }], 0, 10, 'KHR')
check('KHR VAT rounds to 100 ៛ (12,300 → 1,200)', t2.subtotal === 12_300 && t2.vat === 1_200 && t2.total === 13_500, t2)
const t3 = totals([{ qty: 3, price: 1_999 }], 0, 10, 'USD')
check('USD: 3 × $19.99 = $59.97 + VAT $6.00 = $65.97', t3.subtotal === 5_997 && t3.vat === 600 && t3.total === 6_597, t3)
check('discount never above subtotal', totals([{ qty: 1, price: 1_000 }], 99_999, 10, 'KHR').total === 0)
check('USD → riel at 4,100, rounded to 100 ៛', inRiel(6_597, 'USD', 4_100) === 270_500 && inRiel(1_000, 'KHR', 4_100) === 1_000)

// ── Book, clients, items ──
await setupBook(db, 'Sok Design', 'USD', 4_100)
await setSetting(db, 'vat_rate', '10')
await setSetting(db, 'pay_info', 'ABA 000 111 222 · Sok Design')
const ca = await saveClient(db, { name: 'Chan Thy', company: 'Thy Café Co., Ltd.', vat_tin: 'K001-123456789', phone: '012 333 444' })
const cb = await saveClient(db, { name: 'Kim Leng' })
const logo = await saveItem(db, { name: 'Logo design', unit: 'job', price: 15_000, currency: 'USD' })
await saveItem(db, { name: 'Banner print', unit: 'm²', price: 20_000, currency: 'KHR' })
check('items listed', (await listItems(db)).length === 2)
check('client search by company and VAT TIN', (await listClients(db, 'Café'))[0]?.id === ca && (await listClients(db, 'K001'))[0]?.id === ca)

// ── Quote → invoice ──
const q = await createDoc(db, 'QUOTE', '2026-11-17', ca)
const qd = (await getDoc(db, q))!
check('quote numbered at once QT-2026-0001, valid 30 days, book defaults', qd.number === 'QT-2026-0001' && qd.due_date === '2026-12-17' && qd.currency === 'USD' && qd.vat_rate === 10 && qd.khr_per_usd === 4_100, qd)
check('client details copied into the quote', qd.client_name === 'Chan Thy' && qd.client_vat_tin === 'K001-123456789')
await addLine(db, q, { item_id: logo, name: 'Logo design', unit: 'job', qty: 1, price: 15_000 })
const l2 = await addLine(db, q, { name: 'Business cards', qty: 200, price: 10 })
const l3 = await addLine(db, q, { name: 'Typo line', qty: 1, price: 1 })
await removeLine(db, l3)
await updateLine(db, l2, { qty: 300 })
let qq = (await getDoc(db, q))!
check('quote totals kept on the row: $180 + VAT $18 = $198', qq.subtotal === 18_000 && qq.vat === 1_800 && qq.total === 19_800, qq)
await moveLine(db, l2, -1)
check('move line up', (await listLines(db, q))[0].id === l2)
await updateDoc(db, q, { discount: 3_000 })
qq = (await getDoc(db, q))!
check('discount $30: $150 + $15 = $165', qq.total === 16_500, qq)
check('client edit later does not change the quote', (await saveClient(db, { id: ca, name: 'Chan Thy', company: 'New Co' }), (await getDoc(db, q))!.client_company === 'Thy Café Co., Ltd.'))

const inv = await quoteToInvoice(db, q, '2026-11-20')
let id = (await getDoc(db, inv))!
check('quote → draft invoice with same lines and totals, quote accepted', id.kind === 'INVOICE' && id.status === 'DRAFT' && id.number === null && id.total === 16_500 && id.from_id === q && (await listLines(db, inv)).length === 2 && (await getDoc(db, q))!.status === 'ACCEPTED')
check('invoice due in 7 days by default', id.due_date === '2026-11-27')
await issueInvoice(db, inv)
id = (await getDoc(db, inv))!
check('issued invoice gets INV-2026-0001', id.status === 'ISSUED' && id.number === 'INV-2026-0001')
check('issued invoice cannot be deleted', await throws(() => deleteDoc(db, inv), 'ISSUED_KEEP'))

// payments and state
check('state unpaid before due', docState(id, 0, '2026-11-21') === 'unpaid')
check('state overdue after due date', docState(id, 0, '2026-11-28') === 'overdue')
check('payment must be > 0', await throws(() => addPayment(db, inv, { date: '2026-11-22', amount: 0 }), 'BAD_AMOUNT'))
await addPayment(db, inv, { date: '2026-11-22', amount: 10_000, method: 'ABA' })
check('partial payment', (await listDocs(db, { kind: 'INVOICE', today: '2026-11-23' }))[0].state === 'partial')
check('cannot reopen once paid something', await throws(() => reopenInvoice(db, inv), 'HAS_PAYMENTS'))
let o = await outstanding(db, '2026-11-23')
check('outstanding $65 in USD, nothing overdue', o.USD.open === 6_500 && o.USD.overdue === 0 && o.KHR.open === 0, o)
check('overdue later', (await outstanding(db, '2026-12-01')).USD.overdue === 6_500)
check('client owes $65', (await listClients(db, 'Chan'))[0].owing_usd === 6_500)
await addPayment(db, inv, { date: '2026-12-02', amount: 6_500, method: 'CASH' })
check('paid in full', (await listDocs(db, { kind: 'INVOICE', today: '2026-12-05' }))[0].state === 'paid')
check('filter open excludes paid', (await listDocs(db, { kind: 'INVOICE', today: '2026-12-05', state: 'open' })).length === 0)

// KHR invoice for another client, then void
const k = await createDoc(db, 'INVOICE', '2026-12-03', cb)
await updateDoc(db, k, { currency: 'KHR', vat_rate: 0 })
await addLine(db, k, { name: 'Banner print', qty: 2.5, price: 20_000 })
await issueInvoice(db, k)
check('second invoice INV-2026-0002 in riel 50,000', (await getDoc(db, k))!.number === 'INV-2026-0002' && (await getDoc(db, k))!.total === 50_000)
const draft = await createDoc(db, 'INVOICE', '2026-12-04')
check('draft invoice can be deleted', (await deleteDoc(db, draft), !(await getDoc(db, draft))))
const k2 = await duplicateDoc(db, k, '2026-12-05')
check('duplicate is a new draft with the lines', (await getDoc(db, k2))!.status === 'DRAFT' && (await getDoc(db, k2))!.total === 50_000)
await issueInvoice(db, k2)
await voidInvoice(db, k2)
check('void keeps number INV-2026-0003, no money owed', (await getDoc(db, k2))!.number === 'INV-2026-0003' && (await outstanding(db, '2026-12-05')).KHR.open === 50_000)
check('next number continues after void', (await nextNumber(db, 'INVOICE', '2026-12-06')) === 'INV-2026-0004')
check('numbers restart each year', (await nextNumber(db, 'INVOICE', '2027-01-02')) === 'INV-2027-0001')
const pays = await listPayments(db, inv)
await removePayment(db, pays[1].id)
check('remove payment → owing again (overdue by then)', (await listDocs(db, { kind: 'INVOICE', today: '2026-12-05', clientId: ca }))[0].state === 'overdue')

// report
const rep = await monthReport(db, '2026')
const nov = rep.find((r) => r.month === '2026-11' && r.currency === 'USD')
const dec = rep.find((r) => r.month === '2026-12' && r.currency === 'KHR')
check('Nov USD: 1 invoice $165, VAT $15, received $100', nov?.invoices === 1 && nov.invoiced === 16_500 && nov.vat === 1_500 && nov.received === 10_000, rep)
check('Dec KHR: void invoice left out', dec?.invoices === 1 && dec.invoiced === 50_000, rep)

// CSV
const csv = await invoicesCsv(db, '2026-01-01', '2026-12-31')
const rows = csv.trim().split('\r\n')
check('invoices CSV: header + 3 rows, riel column for USD', rows.length === 4 && rows[1].includes('INV-2026-0001') && rows[1].includes('676500'), rows[1])
check('void row has zero amounts', rows[3].includes('VOID') && rows[3].includes(',0,'))
const ccsv = await clientsCsv(db)
check('clients CSV in Customers format', ccsv.startsWith('﻿name,phone,telegram,address,tags'))
const imp = await importClients(db, 'name,phone,company\nKim Leng,1,\nNew Person,012,ACME\n')
check('import skips existing names', imp.added === 1 && imp.skipped === 1)

// currency switch
const cx = await createDoc(db, 'QUOTE', '2026-12-10')
await addLine(db, cx, { name: 'Banner', qty: 2, price: 20_500 })
await updateDoc(db, cx, { currency: 'KHR', vat_rate: 0, discount: 1_000 })
await changeCurrency(db, cx, 'USD')
const cxd = (await getDoc(db, cx))!
check('KHR → USD converts prices and discount at 4,100', cxd.currency === 'USD' && (await listLines(db, cx))[0].price === 500 && cxd.discount === 24 && cxd.total === 976, cxd)
await deleteDoc(db, cx)

// share text
const msg = shareText((await getDoc(db, inv))!, 10_000, { book_name: 'Sok Design', pay_info: 'ABA 000 111 222' }, formatMoney, { title: 'Invoice', total: 'Total', due: 'Due', balance: 'Balance' })
check('share text has number, riel, balance and pay info', msg.includes('INV-2026-0001') && msg.includes('676,500 ៛') && msg.includes('Balance: $65.00') && msg.includes('ABA 000'), msg)

// delete client keeps documents
await deleteClient(db, cb)
check('documents keep client name after client is deleted', (await getDoc(db, k))!.client_name === 'Kim Leng' && (await getDoc(db, k))!.client_id === null)
await setDocClient(db, k2, null)

console.log(failures ? `\n${failures} FAILED` : '\nAll invoice tests passed')
process.exit(failures ? 1 : 0)
