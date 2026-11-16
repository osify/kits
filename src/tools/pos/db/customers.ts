import { db, dbState } from './index'
import { ulid } from '@/core/util/id'
import type { Currency } from '@/core/util/money'
import { today } from '@/core/util/date'

export interface Customer {
  id: string
  name: string
  phone: string | null
  note: string | null
  active: number
  created_at: number
  updated_at: number
}

export interface CustomerRow extends Customer {
  balance: number // in the shop's base currency, minor units (positive = they owe the shop)
  last_at: number | null
}

export interface LedgerRow {
  id: string
  customer_id: string
  kind: 'CHARGE' | 'PAYMENT'
  sale_id: string | null
  sale_number: string | null
  sale_status: string | null
  method: string | null
  currency: Currency
  khr_per_usd: number
  amount: number
  note: string | null
  business_date: string
  created_at: number
}

/** Ledger amount converted into the shop's base currency. Charges of voided sales don't count. */
function conv(base: Currency) {
  return base === 'KHR'
    ? `(CASE g.currency WHEN 'KHR' THEN g.amount ELSE ROUND(g.amount * g.khr_per_usd / 100.0) END)`
    : `(CASE g.currency WHEN 'USD' THEN g.amount ELSE ROUND(g.amount * 100.0 / g.khr_per_usd) END)`
}
const LIVE = `(g.sale_id IS NULL OR NOT EXISTS (SELECT 1 FROM sale s WHERE s.id = g.sale_id AND s.status = 'VOID'))`

export function listCustomers(base: Currency, search = ''): Promise<CustomerRow[]> {
  const q = `%${search.trim()}%`
  return db.query<CustomerRow>(
    `SELECT c.*,
       COALESCE((SELECT SUM(CASE g.kind WHEN 'CHARGE' THEN ${conv(base)} ELSE -${conv(base)} END)
                 FROM customer_ledger g WHERE g.customer_id = c.id AND ${LIVE}), 0) AS balance,
       (SELECT MAX(created_at) FROM customer_ledger g WHERE g.customer_id = c.id) AS last_at
     FROM customer c
     WHERE c.active = 1 AND (c.name LIKE ? OR COALESCE(c.phone, '') LIKE ?)
     ORDER BY balance DESC, c.name`,
    [q, q],
  )
}

export function getCustomer(id: string): Promise<Customer | undefined> {
  return db.get<Customer>(`SELECT * FROM customer WHERE id = ?`, [id])
}

export async function saveCustomer(c: Partial<Customer> & { name: string }): Promise<string> {
  const now = Date.now()
  if (c.id) {
    await db.run(`UPDATE customer SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?`, [c.name, c.phone || null, c.note || null, now, c.id])
    return c.id
  }
  const id = ulid()
  await db.run(`INSERT INTO customer (id, name, phone, note, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`, [
    id,
    c.name,
    c.phone || null,
    c.note || null,
    now,
    now,
  ])
  return id
}

/** Hidden, not deleted, so their sales and ledger stay intact. */
export function archiveCustomer(id: string) {
  return db.run(`UPDATE customer SET active = 0, updated_at = ? WHERE id = ?`, [Date.now(), id])
}

export function ledger(customerId: string): Promise<LedgerRow[]> {
  return db.query<LedgerRow>(
    `SELECT g.*, s.number AS sale_number, s.status AS sale_status
     FROM customer_ledger g LEFT JOIN sale s ON s.id = g.sale_id
     WHERE g.customer_id = ? ORDER BY g.created_at DESC`,
    [customerId],
  )
}

export interface LedgerInput {
  customerId: string
  kind: 'CHARGE' | 'PAYMENT'
  amount: number
  currency: Currency
  khrPerUsd: number
  method?: 'CASH' | 'KHQR' | 'CARD' | 'OTHER' | null
  note?: string
  saleId?: string | null
}

export function ledgerStmt(e: LedgerInput) {
  return {
    sql: `INSERT INTO customer_ledger (id, customer_id, kind, sale_id, method, currency, khr_per_usd, amount, note, business_date, device_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      ulid(),
      e.customerId,
      e.kind,
      e.saleId ?? null,
      e.kind === 'PAYMENT' ? (e.method ?? 'CASH') : null,
      e.currency,
      e.khrPerUsd,
      Math.round(e.amount),
      e.note || null,
      today(),
      dbState.deviceId,
      Date.now(),
    ],
  }
}

/** Manual entry: an opening balance / debt from elsewhere (CHARGE), or money paid back (PAYMENT). */
export async function addLedger(e: LedgerInput) {
  await db.batch([ledgerStmt(e)])
}

export function deleteLedger(id: string) {
  return db.run(`DELETE FROM customer_ledger WHERE id = ? AND sale_id IS NULL`, [id])
}
