/**
 * Invoice data access. Functions take the database first, so they run in the app and in Node
 * tests (scripts/test-invoice.mts). Every write bumps updated_at.
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests
import { centsToRiel, lineTotal, rielToCents, roundRiel, type Currency } from '../../../core/util/money.ts'
import { parseCsv } from '../../crm/db/data.ts'

export type DocKind = 'QUOTE' | 'INVOICE'
export type DocStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'ISSUED' | 'VOID'
/** What a document's badge says (computed from status, payments and dates). */
export type DocState = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'unpaid' | 'partial' | 'paid' | 'overdue' | 'void'

export interface Client {
  id: string
  name: string
  company: string | null
  vat_tin: string | null
  address: string | null
  phone: string | null
  email: string | null
  note: string | null
  created_at: number
}
export interface ClientRow extends Client {
  docs: number
  owing_khr: number
  owing_usd: number
}
export interface Item {
  id: string
  name: string
  unit: string | null
  price: number
  currency: Currency
  active: number
}
export interface Doc {
  id: string
  kind: DocKind
  number: string | null
  status: DocStatus
  client_id: string | null
  client_name: string | null
  client_company: string | null
  client_vat_tin: string | null
  client_address: string | null
  client_phone: string | null
  client_email: string | null
  date: string
  due_date: string | null
  currency: Currency
  khr_per_usd: number
  vat_rate: number
  discount: number
  subtotal: number
  vat: number
  total: number
  note: string | null
  terms: string | null
  from_id: string | null
  issued_at: number | null
  created_at: number
  updated_at: number
}
export interface DocRow extends Doc {
  paid: number
  state: DocState
}
export interface Line {
  id: string
  doc_id: string
  item_id: string | null
  name: string
  detail: string | null
  unit: string | null
  qty: number
  price: number
  sort: number
}
export interface Payment {
  id: string
  doc_id: string
  date: string
  amount: number
  method: string | null
  note: string | null
}

const now = () => Date.now()
const clean = (v: string | null | undefined) => (v ?? '').trim() || null

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSettings(db: DbLike): Promise<Record<string, string>> {
  return Object.fromEntries((await db.query<{ key: string; value: string }>(`SELECT key, value FROM setting`)).map((r) => [r.key, r.value]))
}
export function setSetting(db: DbLike, key: string, value: string) {
  return db.run(`INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, now()])
}
export async function setupBook(db: DbLike, name: string, currency: Currency, khrPerUsd = 4100) {
  const t = now()
  await db.batch(
    [
      ['book_id', ulid()],
      ['book_name', name],
      ['currency', currency],
      ['khr_per_usd', String(khrPerUsd)],
      ['vat_rate', '0'],
      ['due_days', '7'],
      ['valid_days', '30'],
      ['inv_prefix', 'INV'],
      ['qt_prefix', 'QT'],
    ].map(([k, v]) => ({ sql: `INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, bind: [k, v, t] })),
  )
}

// ── Money ───────────────────────────────────────────────────────────────────

export interface Totals {
  subtotal: number
  discount: number
  taxable: number
  vat: number
  total: number
}
/** Line amount: qty × price, riel lines rounded to the 100 ៛ note. */
export const lineAmount = (l: { qty: number; price: number }, currency: Currency) => lineTotal(l.price, l.qty, currency)
/**
 * Document totals from rounded lines: subtotal − discount = taxable; VAT on taxable (riel rounded to
 * 100 ៛, dollars to the cent); total = taxable + VAT.
 */
export function totals(lines: { qty: number; price: number }[], discount: number, vatRate: number, currency: Currency): Totals {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l, currency), 0)
  const d = Math.min(Math.max(0, discount), subtotal)
  const taxable = subtotal - d
  const raw = (taxable * vatRate) / 100
  const vat = currency === 'KHR' ? roundRiel(raw) : Math.round(raw)
  return { subtotal, discount: d, taxable, vat, total: taxable + vat }
}
/** Riel equivalent of an amount (GDT asks tax invoices in dollars to show riel at the stated rate). */
export const inRiel = (minor: number, currency: Currency, khrPerUsd: number) => (currency === 'KHR' ? minor : centsToRiel(minor, khrPerUsd))

// ── Clients ─────────────────────────────────────────────────────────────────

const PAID = `COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.doc_id = d.id), 0)`
const OPEN_INV = `d.kind = 'INVOICE' AND d.status = 'ISSUED'`

export async function saveClient(db: DbLike, c: Partial<Client> & { name: string }): Promise<string> {
  const t = now()
  const v = [c.name.trim(), clean(c.company), clean(c.vat_tin), clean(c.address), clean(c.phone), clean(c.email), clean(c.note)]
  if (c.id) {
    await db.run(`UPDATE client SET name=?, company=?, vat_tin=?, address=?, phone=?, email=?, note=?, updated_at=? WHERE id=?`, [...v, t, c.id])
    return c.id
  }
  const id = ulid()
  await db.run(`INSERT INTO client (name, company, vat_tin, address, phone, email, note, id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [...v, id, t, t])
  return id
}
export function getClient(db: DbLike, id: string) {
  return db.get<Client>(`SELECT * FROM client WHERE id = ?`, [id])
}
export function listClients(db: DbLike, search = '') {
  const q = `%${search.trim()}%`
  const owing = (cur: Currency) =>
    `(SELECT COALESCE(SUM(MAX(0, d.total - ${PAID})), 0) FROM doc d WHERE d.client_id = c.id AND ${OPEN_INV} AND d.currency = '${cur}')`
  return db.query<ClientRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM doc d WHERE d.client_id = c.id) AS docs, ${owing('KHR')} AS owing_khr, ${owing('USD')} AS owing_usd
     FROM client c
     WHERE ? = '%%' OR c.name LIKE ? OR c.company LIKE ? OR c.phone LIKE ? OR c.vat_tin LIKE ?
     ORDER BY c.name COLLATE NOCASE LIMIT 500`,
    [q, q, q, q, q],
  )
}
/** Delete a client. Their documents stay (each keeps its own copy of the client's details). */
export async function deleteClient(db: DbLike, id: string) {
  await db.batch([
    { sql: `UPDATE doc SET client_id = NULL WHERE client_id = ?`, bind: [id] },
    { sql: `DELETE FROM client WHERE id = ?`, bind: [id] },
  ])
}

// ── Items ───────────────────────────────────────────────────────────────────

export function listItems(db: DbLike, all = false) {
  return db.query<Item>(`SELECT * FROM item ${all ? '' : 'WHERE active = 1'} ORDER BY name COLLATE NOCASE`)
}
export async function saveItem(db: DbLike, i: Partial<Item> & { name: string; price: number; currency: Currency }) {
  const t = now()
  if (i.id) {
    await db.run(`UPDATE item SET name=?, unit=?, price=?, currency=?, active=?, updated_at=? WHERE id=?`, [i.name.trim(), clean(i.unit), i.price, i.currency, i.active ?? 1, t, i.id])
    return i.id
  }
  const id = ulid()
  await db.run(`INSERT INTO item (id, name, unit, price, currency, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)`, [id, i.name.trim(), clean(i.unit), i.price, i.currency, t, t])
  return id
}
export function deleteItem(db: DbLike, id: string) {
  return db.run(`DELETE FROM item WHERE id = ?`, [id])
}

// ── Documents ───────────────────────────────────────────────────────────────

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Next number of a kind for the year of `date`: QT-2026-0001, INV-2026-0001 (prefixes from settings). */
export async function nextNumber(db: DbLike, kind: DocKind, date: string): Promise<string> {
  const s = await getSettings(db)
  const prefix = (kind === 'QUOTE' ? s.qt_prefix || 'QT' : s.inv_prefix || 'INV').trim()
  const head = `${prefix}-${date.slice(0, 4)}-`
  const rows = await db.query<{ number: string }>(`SELECT number FROM doc WHERE kind = ? AND number LIKE ?`, [kind, `${head}%`])
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.slice(head.length)) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}

/** New quote (numbered now) or invoice (a draft: numbered when issued), with the book's defaults. */
export async function createDoc(db: DbLike, kind: DocKind, date: string, clientId?: string | null): Promise<string> {
  const s = await getSettings(db)
  const t = now()
  const id = ulid()
  const due = kind === 'QUOTE' ? addDays(date, Number(s.valid_days || 30)) : addDays(date, Number(s.due_days || 7))
  await db.run(
    `INSERT INTO doc (id, kind, number, status, date, due_date, currency, khr_per_usd, vat_rate, discount, terms, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    [
      id, kind, kind === 'QUOTE' ? await nextNumber(db, 'QUOTE', date) : null, 'DRAFT', date, due,
      s.currency === 'USD' ? 'USD' : 'KHR', Number(s.khr_per_usd || 4100), Number(s.vat_rate || 0),
      clean(kind === 'QUOTE' ? s.quote_terms : s.invoice_terms), t, t,
    ],
  )
  if (clientId) await setDocClient(db, id, clientId)
  return id
}
export function getDoc(db: DbLike, id: string) {
  return db.get<Doc>(`SELECT * FROM doc WHERE id = ?`, [id])
}
/** Copy the client's current details into the document. */
export async function setDocClient(db: DbLike, docId: string, clientId: string | null) {
  const c = clientId ? await getClient(db, clientId) : null
  await db.run(
    `UPDATE doc SET client_id=?, client_name=?, client_company=?, client_vat_tin=?, client_address=?, client_phone=?, client_email=?, updated_at=? WHERE id=?`,
    [c?.id ?? null, c?.name ?? null, c?.company ?? null, c?.vat_tin ?? null, c?.address ?? null, c?.phone ?? null, c?.email ?? null, now(), docId],
  )
}
const DOC_COLS = ['date', 'due_date', 'currency', 'khr_per_usd', 'vat_rate', 'discount', 'note', 'terms', 'status'] as const
type DocFields = Partial<Pick<Doc, (typeof DOC_COLS)[number]>>
/** Save some fields of a document (each field is saved as it is typed), then refresh its totals. */
export async function updateDoc(db: DbLike, id: string, f: DocFields) {
  const cols = DOC_COLS.filter((c) => c in f)
  if (!cols.length) return
  await db.run(`UPDATE doc SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => (f as any)[c] ?? null), now(), id])
  await recalc(db, id)
}
/** Switch a document between riel and dollars: line prices and the discount are converted at its rate. */
export async function changeCurrency(db: DbLike, id: string, to: Currency) {
  const d = await getDoc(db, id)
  if (!d || d.currency === to) return
  const conv = (v: number) => (to === 'USD' ? rielToCents(v, d.khr_per_usd) : centsToRiel(v, d.khr_per_usd))
  const lines = await listLines(db, id)
  await db.batch([
    ...lines.map((l) => ({ sql: `UPDATE doc_line SET price = ? WHERE id = ?`, bind: [conv(l.price), l.id] })),
    { sql: `UPDATE doc SET currency = ?, discount = ?, updated_at = ? WHERE id = ?`, bind: [to, conv(d.discount), now(), id] },
  ])
  await recalc(db, id)
}
/** Store subtotal / VAT / total on the document (lists and reports read them). */
export async function recalc(db: DbLike, id: string): Promise<Totals | null> {
  const d = await getDoc(db, id)
  if (!d) return null
  const tt = totals(await listLines(db, id), d.discount, d.vat_rate, d.currency)
  await db.run(`UPDATE doc SET subtotal = ?, vat = ?, total = ? WHERE id = ?`, [tt.subtotal, tt.vat, tt.total, id])
  return tt
}

/** Give a draft invoice its number and lock it as issued. */
export async function issueInvoice(db: DbLike, id: string) {
  const d = await getDoc(db, id)
  if (!d || d.kind !== 'INVOICE' || d.status !== 'DRAFT') return
  const number = d.number ?? (await nextNumber(db, 'INVOICE', d.date))
  await db.run(`UPDATE doc SET number = ?, status = 'ISSUED', issued_at = ?, updated_at = ? WHERE id = ?`, [number, now(), now(), id])
}
/** Back to draft to fix a mistake: only while nothing has been paid. Keeps its number. */
export async function reopenInvoice(db: DbLike, id: string) {
  const p = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM payment WHERE doc_id = ?`, [id])
  if (p?.n) throw new Error('HAS_PAYMENTS')
  await db.run(`UPDATE doc SET status = 'DRAFT', updated_at = ? WHERE id = ? AND kind = 'INVOICE'`, [now(), id])
}
/** Cancel an issued invoice. It keeps its number (no gaps in the numbering). */
export async function voidInvoice(db: DbLike, id: string) {
  await db.run(`UPDATE doc SET status = 'VOID', updated_at = ? WHERE id = ? AND kind = 'INVOICE'`, [now(), id])
}
/** Quotes can always be deleted; invoices only while they are drafts without a number. */
export async function deleteDoc(db: DbLike, id: string) {
  const d = await getDoc(db, id)
  if (!d) return
  if (d.kind === 'INVOICE' && (d.status !== 'DRAFT' || d.number)) throw new Error('ISSUED_KEEP')
  await db.batch([
    { sql: `DELETE FROM doc_line WHERE doc_id = ?`, bind: [id] },
    { sql: `DELETE FROM payment WHERE doc_id = ?`, bind: [id] },
    { sql: `DELETE FROM doc WHERE id = ?`, bind: [id] },
  ])
}

/** Copy a document's client, settings and lines into a new draft of `kind` dated `date`. */
async function copyDoc(db: DbLike, src: Doc, kind: DocKind, date: string): Promise<string> {
  const id = await createDoc(db, kind, date)
  const t = now()
  await db.run(
    `UPDATE doc SET client_id=?, client_name=?, client_company=?, client_vat_tin=?, client_address=?, client_phone=?, client_email=?,
       currency=?, khr_per_usd=?, vat_rate=?, discount=?, note=?, from_id=?, updated_at=? WHERE id=?`,
    [src.client_id, src.client_name, src.client_company, src.client_vat_tin, src.client_address, src.client_phone, src.client_email,
      src.currency, src.khr_per_usd, src.vat_rate, src.discount, src.note, kind === 'INVOICE' && src.kind === 'QUOTE' ? src.id : null, t, id],
  )
  const lines = await listLines(db, src.id)
  if (lines.length)
    await db.batch(
      lines.map((l) => ({
        sql: `INSERT INTO doc_line (id, doc_id, item_id, name, detail, unit, qty, price, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        bind: [ulid(), id, l.item_id, l.name, l.detail, l.unit, l.qty, l.price, l.sort, t],
      })),
    )
  await recalc(db, id)
  return id
}
/** Quote accepted → a draft invoice with the same lines; the quote is marked accepted. */
export async function quoteToInvoice(db: DbLike, quoteId: string, date: string): Promise<string> {
  const q = await getDoc(db, quoteId)
  if (!q || q.kind !== 'QUOTE') throw new Error('NOT_A_QUOTE')
  const id = await copyDoc(db, q, 'INVOICE', date)
  await db.run(`UPDATE doc SET status = 'ACCEPTED', updated_at = ? WHERE id = ?`, [now(), quoteId])
  return id
}
export async function duplicateDoc(db: DbLike, id: string, date: string): Promise<string> {
  const d = await getDoc(db, id)
  if (!d) throw new Error('NOT_FOUND')
  return copyDoc(db, d, d.kind, date)
}

// lines
export function listLines(db: DbLike, docId: string) {
  return db.query<Line>(`SELECT * FROM doc_line WHERE doc_id = ? ORDER BY sort, created_at`, [docId])
}
export async function addLine(db: DbLike, docId: string, l: { item_id?: string | null; name: string; detail?: string | null; unit?: string | null; qty: number; price: number }) {
  const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM doc_line WHERE doc_id = ?`, [docId])
  const id = ulid()
  await db.run(`INSERT INTO doc_line (id, doc_id, item_id, name, detail, unit, qty, price, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    id, docId, l.item_id ?? null, l.name.trim(), clean(l.detail), clean(l.unit), l.qty, l.price, s?.s ?? 0, now(),
  ])
  await touch(db, docId)
  return id
}
export async function updateLine(db: DbLike, id: string, f: Partial<Pick<Line, 'name' | 'detail' | 'unit' | 'qty' | 'price'>>) {
  const cols = (['name', 'detail', 'unit', 'qty', 'price'] as const).filter((c) => c in f)
  if (cols.length) await db.run(`UPDATE doc_line SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => (f as any)[c] ?? null), id])
  const l = await db.get<{ doc_id: string }>(`SELECT doc_id FROM doc_line WHERE id = ?`, [id])
  if (l) await touch(db, l.doc_id)
}
export async function removeLine(db: DbLike, id: string) {
  const l = await db.get<{ doc_id: string }>(`SELECT doc_id FROM doc_line WHERE id = ?`, [id])
  await db.run(`DELETE FROM doc_line WHERE id = ?`, [id])
  if (l) await touch(db, l.doc_id)
}
/** Move a line one place up (-1) or down (+1). */
export async function moveLine(db: DbLike, id: string, dir: -1 | 1) {
  const l = await db.get<Line>(`SELECT * FROM doc_line WHERE id = ?`, [id])
  if (!l) return
  const all = await listLines(db, l.doc_id)
  const i = all.findIndex((x) => x.id === id)
  const j = i + dir
  if (j < 0 || j >= all.length) return
  ;[all[i], all[j]] = [all[j], all[i]]
  await db.batch(all.map((x, k) => ({ sql: `UPDATE doc_line SET sort = ? WHERE id = ?`, bind: [k, x.id] })))
  await touch(db, l.doc_id)
}
async function touch(db: DbLike, docId: string) {
  await db.run(`UPDATE doc SET updated_at = ? WHERE id = ?`, [now(), docId])
  await recalc(db, docId)
}

// payments
export function listPayments(db: DbLike, docId: string) {
  return db.query<Payment>(`SELECT * FROM payment WHERE doc_id = ? ORDER BY date, created_at`, [docId])
}
export async function addPayment(db: DbLike, docId: string, p: { date: string; amount: number; method?: string | null; note?: string | null }) {
  if (!(p.amount > 0)) throw new Error('BAD_AMOUNT')
  await db.run(`INSERT INTO payment (id, doc_id, date, amount, method, note, created_at) VALUES (?,?,?,?,?,?,?)`, [ulid(), docId, p.date, p.amount, clean(p.method), clean(p.note), now()])
  await db.run(`UPDATE doc SET updated_at = ? WHERE id = ?`, [now(), docId])
}
export async function removePayment(db: DbLike, id: string) {
  await db.run(`UPDATE doc SET updated_at = ? WHERE id = (SELECT doc_id FROM payment WHERE id = ?)`, [now(), id])
  await db.run(`DELETE FROM payment WHERE id = ?`, [id])
}

/** The badge of a document on `today`. */
export function docState(d: Pick<Doc, 'kind' | 'status' | 'total' | 'due_date'>, paid: number, today: string): DocState {
  if (d.kind === 'QUOTE') {
    if (d.status === 'ACCEPTED') return 'accepted'
    if (d.status === 'DECLINED') return 'declined'
    if (d.due_date && d.due_date < today) return 'expired'
    return d.status === 'SENT' ? 'sent' : 'draft'
  }
  if (d.status === 'VOID') return 'void'
  if (d.status === 'DRAFT') return 'draft'
  if (paid >= d.total) return 'paid'
  if (d.due_date && d.due_date < today) return 'overdue'
  return paid > 0 ? 'partial' : 'unpaid'
}

export interface DocQuery {
  kind: DocKind
  search?: string
  clientId?: string
  state?: DocState | 'open' | ''
  today: string
}
export async function listDocs(db: DbLike, q: DocQuery): Promise<DocRow[]> {
  const s = `%${(q.search ?? '').trim()}%`
  const rows = await db.query<Doc & { paid: number }>(
    `SELECT d.*, ${PAID} AS paid FROM doc d
     WHERE d.kind = ? AND (? = '' OR d.client_id = ?)
       AND (? = '%%' OR d.number LIKE ? OR d.client_name LIKE ? OR d.client_company LIKE ?)
     ORDER BY d.date DESC, d.created_at DESC LIMIT 1000`,
    [q.kind, q.clientId ?? '', q.clientId ?? '', s, s, s, s],
  )
  const out = rows.map((r) => ({ ...r, state: docState(r, r.paid, q.today) }))
  if (!q.state) return out
  if (q.state === 'open') return out.filter((r) => ['unpaid', 'partial', 'overdue'].includes(r.state))
  return out.filter((r) => r.state === q.state)
}

/** Money still to collect on issued invoices, per currency, and how much of it is overdue. */
export async function outstanding(db: DbLike, today: string) {
  const rows = await db.query<{ currency: Currency; total: number; paid: number; due_date: string | null }>(
    `SELECT d.currency, d.total, ${PAID} AS paid, d.due_date FROM doc d WHERE ${OPEN_INV}`,
  )
  const out = { KHR: { open: 0, overdue: 0, count: 0, overdueCount: 0 }, USD: { open: 0, overdue: 0, count: 0, overdueCount: 0 } }
  for (const r of rows) {
    const left = r.total - r.paid
    if (left <= 0) continue
    const o = out[r.currency]
    o.open += left
    o.count++
    if (r.due_date && r.due_date < today) {
      o.overdue += left
      o.overdueCount++
    }
  }
  return out
}

// ── Reports & export ────────────────────────────────────────────────────────

export interface MonthRow {
  month: string // YYYY-MM
  currency: Currency
  invoices: number
  invoiced: number
  vat: number
  received: number
}
/** Per month and currency: issued invoices (by invoice date), their VAT, and money received (by payment date). Void invoices are left out. */
export async function monthReport(db: DbLike, year: string): Promise<MonthRow[]> {
  const inv = await db.query<{ month: string; currency: Currency; n: number; total: number; vat: number }>(
    `SELECT substr(d.date, 1, 7) AS month, d.currency, COUNT(*) AS n, SUM(d.total) AS total, SUM(d.vat) AS vat
     FROM doc d WHERE ${OPEN_INV} AND substr(d.date, 1, 4) = ? GROUP BY month, d.currency`,
    [year],
  )
  const rec = await db.query<{ month: string; currency: Currency; amount: number }>(
    `SELECT substr(p.date, 1, 7) AS month, d.currency, SUM(p.amount) AS amount
     FROM payment p JOIN doc d ON d.id = p.doc_id WHERE ${OPEN_INV} AND substr(p.date, 1, 4) = ? GROUP BY month, d.currency`,
    [year],
  )
  const map = new Map<string, MonthRow>()
  const row = (month: string, currency: Currency) => {
    const k = `${month}|${currency}`
    if (!map.has(k)) map.set(k, { month, currency, invoices: 0, invoiced: 0, vat: 0, received: 0 })
    return map.get(k)!
  }
  for (const r of inv) Object.assign(row(r.month, r.currency), { invoices: r.n, invoiced: r.total, vat: r.vat })
  for (const r of rec) row(r.month, r.currency).received = r.amount
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const num = (v: number, c: Currency) => (c === 'KHR' ? String(v) : (v / 100).toFixed(2))
/** Issued and void invoices in a date range, for the accountant (amounts in the invoice currency + riel). */
export async function invoicesCsv(db: DbLike, from: string, to: string): Promise<string> {
  const rows = await db.query<Doc & { paid: number }>(
    `SELECT d.*, ${PAID} AS paid FROM doc d WHERE d.kind = 'INVOICE' AND d.status IN ('ISSUED','VOID') AND d.date BETWEEN ? AND ? ORDER BY d.date, d.number`,
    [from, to],
  )
  const head = ['date', 'number', 'status', 'client', 'company', 'client_vat_tin', 'currency', 'subtotal', 'discount', 'vat', 'total', 'paid', 'balance', 'khr_per_usd', 'total_khr', 'vat_khr', 'due_date']
  return (
    '﻿' +
    [
      head.join(','),
      ...rows.map((r) => {
        const v = r.status === 'VOID'
        const z = (n: number) => num(v ? 0 : n, r.currency)
        return [r.date, r.number, r.status, r.client_name, r.client_company, r.client_vat_tin, r.currency, z(r.subtotal), z(r.discount), z(r.vat), z(r.total), z(r.paid),
          z(Math.max(0, r.total - r.paid)), r.khr_per_usd, v ? 0 : inRiel(r.total, r.currency, r.khr_per_usd), v ? 0 : inRiel(r.vat, r.currency, r.khr_per_usd), r.due_date]
          .map(esc).join(',')
      }),
    ].join('\r\n') +
    '\r\n'
  )
}
/** Clients in the Customers (CRM) column format, so the file imports there directly. */
export async function clientsCsv(db: DbLike): Promise<string> {
  const rows = await db.query<Client>(`SELECT * FROM client ORDER BY name COLLATE NOCASE`)
  const head = ['name', 'phone', 'telegram', 'address', 'tags', 'birthday', 'note', 'company', 'email', 'vat_tin']
  return '﻿' + [head.join(','), ...rows.map((c) => [c.name, c.phone, '', c.address, 'Client', '', c.note, c.company, c.email, c.vat_tin].map(esc).join(','))].join('\r\n') + '\r\n'
}
/** Import clients from a CSV with a "name" column (Customers export works). Skips names already there. */
export async function importClients(db: DbLike, text: string): Promise<{ added: number; skipped: number }> {
  const rows = parseCsv(text)
  if (!rows.length) return { added: 0, skipped: 0 }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (n: string) => head.indexOf(n)
  if (col('name') < 0) throw new Error('NO_NAME_COLUMN')
  const have = new Set((await db.query<{ n: string }>(`SELECT lower(name) AS n FROM client`)).map((r) => r.n))
  let added = 0
  let skipped = 0
  for (const r of rows.slice(1)) {
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '')
    const name = get('name')
    if (!name || have.has(name.toLowerCase())) {
      skipped++
      continue
    }
    await saveClient(db, { name, phone: get('phone'), address: get('address'), note: get('note'), company: get('company'), email: get('email'), vat_tin: get('vat_tin') })
    have.add(name.toLowerCase())
    added++
  }
  return { added, skipped }
}

/** A short message for Telegram / SMS: number, amount, due date and how to pay. */
export function shareText(d: Doc, paid: number, s: Record<string, string>, fmt: (v: number, c: Currency) => string, words: { title: string; total: string; due: string; balance: string }) {
  const lines = [
    `${s.book_name ?? ''}`.trim(),
    `${words.title} ${d.number ?? ''}`.trim(),
    `${words.total}: ${fmt(d.total, d.currency)}${d.currency === 'USD' ? ` (${fmt(inRiel(d.total, 'USD', d.khr_per_usd), 'KHR')})` : ''}`,
  ]
  if (d.kind === 'INVOICE' && paid > 0 && paid < d.total) lines.push(`${words.balance}: ${fmt(d.total - paid, d.currency)}`)
  if (d.due_date) lines.push(`${words.due}: ${d.due_date}`)
  if (s.pay_info) lines.push('', s.pay_info)
  return lines.filter((x, i) => x || i > 0).join('\n')
}

export async function referencedPhotos(db: DbLike): Promise<string[]> {
  const s = await getSettings(db)
  return [s.logo, s.khqr].filter(Boolean) as string[]
}
