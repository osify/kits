import { db, dbState } from './index'
import { ulid } from '@/core/util/id'
import { lineTotal, roundRiel, type Currency } from '@/core/util/money'
import type { Stmt } from '@/core/db/protocol'
import type { Item } from './catalog'
import type { Shop } from './shop'
import { today } from '@/core/util/date'
import { prefs } from '@/core/util/prefs'
import { ledgerStmt } from './customers'

export type SaleKind = 'POS' | 'QUICK'
export type SaleStatus = 'DRAFT' | 'PAID' | 'SUBMITTED' | 'CLOSED' | 'VOID'
/** DEBT = pay later: the amount goes on the customer's account. */
export type PayMethod = 'CASH' | 'KHQR' | 'CARD' | 'OTHER' | 'DEBT'

export interface LineModifier {
  group_id: string
  group_name: string
  option_id: string
  name: string
  name_km: string | null
  price_delta: number
}

export interface SaleLine {
  id: string
  sale_id: string
  item_id: string | null
  name: string
  qty: number
  unit_price: number
  modifiers: string | null
  line_total: number
  group_no: number | null
  internal: number
  sort: number
}

export interface Sale {
  id: string
  kind: SaleKind
  number: string | null
  business_date: string
  status: SaleStatus
  currency: Currency
  khr_per_usd: number
  subtotal: number
  discount: number
  total: number
  note: string | null
  device_id: string
  ref_sale_id: string | null
  void_reason: string | null
  customer_id: string | null
  parked_label: string | null
  created_at: number
  updated_at: number
  closed_at: number | null
}

export interface Payment {
  id: string
  sale_id: string
  method: PayMethod
  currency: Currency
  amount: number
  tendered: number | null
  change_due: number | null
  created_at: number
}

export interface SaleWithLines extends Sale {
  lines: SaleLine[]
  payments: Payment[]
  customer_name?: string | null
}

export { today }

/** "-K7Q" style device tag, only when multi-device sync is on. */
export function deviceTag(): string {
  return prefs.get('pos.sync') === '1' ? `-${dbState.deviceId.slice(-3)}` : ''
}

export function parseMods(json: string | null): LineModifier[] {
  if (!json) return []
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

const modsKey = (mods: LineModifier[]) =>
  mods
    .map((m) => m.option_id)
    .sort()
    .join(',')

// ── read ────────────────────────────────────────────────────────────────────
export async function getSale(id: string): Promise<SaleWithLines | null> {
  const s = await db.get<Sale & { customer_name: string | null }>(
    `SELECT s.*, c.name AS customer_name FROM sale s LEFT JOIN customer c ON c.id = s.customer_id WHERE s.id = ?`,
    [id],
  )
  if (!s) return null
  const lines = await db.query<SaleLine>(`SELECT * FROM sale_line WHERE sale_id = ? ORDER BY sort, rowid`, [id])
  const payments = await db.query<Payment>(`SELECT * FROM payment WHERE sale_id = ? ORDER BY created_at`, [id])
  return { ...s, lines, payments }
}

/** Recompute line totals and the sale totals from its lines (riel lines rounded per line). */
async function recalc(saleId: string): Promise<void> {
  const s = await db.get<Sale>(`SELECT * FROM sale WHERE id = ?`, [saleId])
  if (!s) return
  const lines = await db.query<SaleLine>(`SELECT * FROM sale_line WHERE sale_id = ?`, [saleId])
  const stmts: Stmt[] = []
  let subtotal = 0
  for (const l of lines) {
    const lt = l.internal ? 0 : lineTotal(l.unit_price, l.qty, s.currency)
    if (lt !== l.line_total) stmts.push({ sql: `UPDATE sale_line SET line_total = ? WHERE id = ?`, bind: [lt, l.id] })
    subtotal += lt
  }
  const discount = Math.min(s.discount, subtotal)
  let total = Math.max(0, subtotal - discount)
  if (s.currency === 'KHR') total = roundRiel(total)
  stmts.push({ sql: `UPDATE sale SET subtotal = ?, discount = ?, total = ?, updated_at = ? WHERE id = ?`, bind: [subtotal, discount, total, Date.now(), saleId] })
  await db.batch(stmts)
}

function newSaleStmt(id: string, kind: SaleKind, date: string, shop: Shop): Stmt {
  const now = Date.now()
  return {
    sql: `INSERT INTO sale (id, kind, business_date, status, currency, khr_per_usd, device_id, created_at, updated_at)
          VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
    bind: [id, kind, date, shop.base_currency, shop.khr_per_usd, dbState.deviceId, now, now],
  }
}

// ── editing lines (shared by POS cart and Quick Sales tally) ───────────────
export async function addLine(saleId: string, item: Item, mods: LineModifier[] = [], qty = 1, internal = false): Promise<void> {
  const key = modsKey(mods)
  const lines = await db.query<SaleLine>(`SELECT * FROM sale_line WHERE sale_id = ? AND item_id = ? AND internal = ?`, [saleId, item.id, internal ? 1 : 0])
  const twin = lines.find((l) => modsKey(parseMods(l.modifiers)) === key)
  if (twin) {
    await db.run(`UPDATE sale_line SET qty = qty + ? WHERE id = ?`, [qty, twin.id])
  } else {
    const unit = item.price + mods.reduce((s, m) => s + (m.price_delta || 0), 0)
    const sort = (await db.get<{ m: number }>(`SELECT COALESCE(MAX(sort), 0) + 1 AS m FROM sale_line WHERE sale_id = ?`, [saleId]))?.m ?? 0
    await db.run(
      `INSERT INTO sale_line (id, sale_id, item_id, name, qty, unit_price, modifiers, line_total, internal, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [ulid(), saleId, item.id, displayName(item), qty, unit, mods.length ? JSON.stringify(mods) : null, internal ? 1 : 0, sort],
    )
  }
  await recalc(saleId)
}

/** Name snapshot on the line: "Latte (ឡាតេ)" when both languages exist. */
function displayName(item: Pick<Item, 'name' | 'name_km'>) {
  return item.name_km && item.name_km !== item.name ? `${item.name_km} / ${item.name}` : item.name
}

export async function setLineQty(lineId: string, qty: number): Promise<void> {
  const l = await db.get<SaleLine>(`SELECT * FROM sale_line WHERE id = ?`, [lineId])
  if (!l) return
  if (qty <= 0) await db.run(`DELETE FROM sale_line WHERE id = ?`, [lineId])
  else await db.run(`UPDATE sale_line SET qty = ? WHERE id = ?`, [qty, lineId])
  await recalc(l.sale_id)
}

/** Change the add-ons of an existing line (merges into an identical line if present). */
export async function setLineModifiers(lineId: string, item: Item, mods: LineModifier[]): Promise<void> {
  const l = await db.get<SaleLine>(`SELECT * FROM sale_line WHERE id = ?`, [lineId])
  if (!l) return
  await db.run(`DELETE FROM sale_line WHERE id = ?`, [lineId])
  await addLine(l.sale_id, item, mods, l.qty, !!l.internal)
}

export async function setLineInternal(lineId: string, internal: boolean): Promise<void> {
  const l = await db.get<SaleLine>(`SELECT * FROM sale_line WHERE id = ?`, [lineId])
  if (!l) return
  await db.run(`UPDATE sale_line SET internal = ? WHERE id = ?`, [internal ? 1 : 0, lineId])
  await recalc(l.sale_id)
}

export async function setDiscount(saleId: string, discount: number): Promise<void> {
  await db.run(`UPDATE sale SET discount = ? WHERE id = ?`, [Math.max(0, Math.round(discount)), saleId])
  await recalc(saleId)
}

export async function setNote(saleId: string, note: string): Promise<void> {
  await db.run(`UPDATE sale SET note = ?, updated_at = ? WHERE id = ?`, [note || null, Date.now(), saleId])
}

export async function clearLines(saleId: string): Promise<void> {
  await db.batch([
    { sql: `DELETE FROM sale_line WHERE sale_id = ?`, bind: [saleId] },
    { sql: `UPDATE sale SET discount = 0, note = NULL WHERE id = ?`, bind: [saleId] },
  ])
  await recalc(saleId)
}

// ── POS ─────────────────────────────────────────────────────────────────────
/** This device's open cart. Kept in the database, so a refresh or crash loses nothing. */
export async function getPosDraft(shop: Shop): Promise<SaleWithLines> {
  const row = await db.get<{ id: string }>(
    `SELECT id FROM sale WHERE kind = 'POS' AND status = 'DRAFT' AND device_id = ? AND parked_label IS NULL ORDER BY created_at DESC LIMIT 1`,
    [dbState.deviceId],
  )
  if (row) return (await getSale(row.id))!
  const id = ulid()
  await db.batch([newSaleStmt(id, 'POS', today(), shop)])
  return (await getSale(id))!
}

// ── parked tickets (hold a sale, serve the next customer, resume later) ────
export interface ParkedRow {
  id: string
  parked_label: string
  total: number
  items: number
  updated_at: number
}

export function listParked(): Promise<ParkedRow[]> {
  return db.query<ParkedRow>(
    `SELECT s.id, s.parked_label, s.total, s.updated_at, (SELECT COALESCE(SUM(qty), 0) FROM sale_line l WHERE l.sale_id = s.id) AS items
     FROM sale s WHERE s.kind = 'POS' AND s.status = 'DRAFT' AND s.device_id = ? AND s.parked_label IS NOT NULL
     ORDER BY s.updated_at`,
    [dbState.deviceId],
  )
}

export async function parkSale(saleId: string, label: string) {
  await db.run(`UPDATE sale SET parked_label = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'`, [label.trim() || '—', Date.now(), saleId])
}

/** Resume a parked ticket. The current cart, if it has items, is parked in its place. */
export async function resumeParked(parkedId: string, currentId: string | null, autoLabel: string) {
  const stmts: Stmt[] = []
  if (currentId) {
    const n = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sale_line WHERE sale_id = ?`, [currentId]))?.n ?? 0
    stmts.push(
      n
        ? { sql: `UPDATE sale SET parked_label = ?, updated_at = ? WHERE id = ?`, bind: [autoLabel, Date.now(), currentId] }
        : { sql: `DELETE FROM sale WHERE id = ? AND status = 'DRAFT'`, bind: [currentId] },
    )
  }
  stmts.push({ sql: `UPDATE sale SET parked_label = NULL, updated_at = ? WHERE id = ?`, bind: [Date.now(), parkedId] })
  await db.batch(stmts)
}

export async function setSaleCustomer(saleId: string, customerId: string | null) {
  await db.run(`UPDATE sale SET customer_id = ?, updated_at = ? WHERE id = ?`, [customerId, Date.now(), saleId])
}

export interface PayInput {
  method: PayMethod
  /** what the customer handed over, in `currency` minor units (cash only) */
  tendered?: number | null
  currency: Currency
  /** change given, in the sale currency minor units */
  change?: number | null
}

async function closedDays(): Promise<Set<string>> {
  const rows = await db.query<{ d: string }>(`SELECT business_date AS d FROM day_close`)
  return new Set(rows.map((r) => r.d))
}

/** Pay a POS cart: number it, mark PAID, record the payment. Returns the paid sale. */
export async function checkout(saleId: string, pay: PayInput): Promise<SaleWithLines> {
  const s = await getSale(saleId)
  if (!s || s.status !== 'DRAFT') throw new Error('Sale is not open')
  if (!s.lines.length) throw new Error('Cart is empty')
  if (pay.method === 'DEBT' && !s.customer_id) throw new Error('NEED_CUSTOMER')
  const date = today()
  if ((await closedDays()).has(date)) throw new Error('DAY_CLOSED')
  // Numbers count this device's sales; with sync on, a short device tag keeps them unique across devices.
  const seq =
    ((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sale WHERE kind = 'POS' AND business_date = ? AND device_id = ? AND number IS NOT NULL`, [date, dbState.deviceId]))?.n ?? 0) + 1
  const number = `${date.replace(/-/g, '').slice(2)}${deviceTag()}-${String(seq).padStart(3, '0')}`
  const now = Date.now()
  await db.batch([
    { sql: `UPDATE sale SET status = 'PAID', number = ?, business_date = ?, updated_at = ? WHERE id = ?`, bind: [number, date, now, saleId] },
    {
      sql: `INSERT INTO payment (id, sale_id, method, currency, amount, tendered, change_due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [ulid(), saleId, pay.method, pay.currency, s.total, pay.tendered ?? null, pay.change ?? null, now],
    },
    // Pay later: the sale total goes on the customer's account.
    ...(pay.method === 'DEBT'
      ? [ledgerStmt({ customerId: s.customer_id!, kind: 'CHARGE', amount: s.total, currency: s.currency, khrPerUsd: s.khr_per_usd, saleId })]
      : []),
  ])
  return (await getSale(saleId))!
}

/** Void a paid sale (only while its day is still open). Kept for the audit trail. */
export async function voidSale(saleId: string, reason: string): Promise<void> {
  const s = await db.get<Sale>(`SELECT * FROM sale WHERE id = ?`, [saleId])
  if (!s) return
  if ((await closedDays()).has(s.business_date)) throw new Error('DAY_CLOSED')
  await db.run(`UPDATE sale SET status = 'VOID', void_reason = ?, updated_at = ? WHERE id = ?`, [reason || null, Date.now(), saleId])
}

// ── Quick Sales (one tally per day, as in LomOr) ────────────────────────────
/** The day's tally, created on first use. */
export async function getQuickSale(date: string, shop: Shop, create = true): Promise<SaleWithLines | null> {
  const row = await db.get<{ id: string }>(
    `SELECT id FROM sale WHERE kind = 'QUICK' AND business_date = ? AND device_id = ? AND status IN ('DRAFT','SUBMITTED','CLOSED') ORDER BY created_at LIMIT 1`,
    [date, dbState.deviceId],
  )
  if (row) return getSale(row.id)
  if (!create) return null
  const id = ulid()
  const seq = date.replace(/-/g, '').slice(2)
  await db.batch([newSaleStmt(id, 'QUICK', date, shop), { sql: `UPDATE sale SET number = ? WHERE id = ?`, bind: [`Q${seq}${deviceTag()}`, id] }])
  return getSale(id)
}

export async function setQuickStatus(saleId: string, status: 'DRAFT' | 'SUBMITTED'): Promise<void> {
  await db.run(`UPDATE sale SET status = ?, updated_at = ? WHERE id = ? AND status <> 'CLOSED'`, [status, Date.now(), saleId])
}

// ── history ─────────────────────────────────────────────────────────────────
export interface SaleRow extends Sale {
  items: number
  method: PayMethod | null
  customer_name: string | null
}

export function listSales(from: string, to: string, kind?: SaleKind): Promise<SaleRow[]> {
  return db.query<SaleRow>(
    `SELECT s.*,
       (SELECT COALESCE(SUM(qty), 0) FROM sale_line l WHERE l.sale_id = s.id) AS items,
       (SELECT method FROM payment p WHERE p.sale_id = s.id ORDER BY created_at LIMIT 1) AS method,
       (SELECT name FROM customer c WHERE c.id = s.customer_id) AS customer_name
     FROM sale s
     WHERE s.business_date BETWEEN ? AND ? AND s.status <> 'DRAFT' ${kind ? 'AND s.kind = ?' : ''}
        OR (s.kind = 'QUICK' AND s.status = 'DRAFT' AND s.business_date BETWEEN ? AND ?
            AND EXISTS (SELECT 1 FROM sale_line x WHERE x.sale_id = s.id) ${kind && kind !== 'QUICK' ? 'AND 0' : ''})
     ORDER BY s.business_date DESC, s.created_at DESC`,
    kind ? [from, to, kind, from, to] : [from, to, from, to],
  )
}
