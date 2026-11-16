import { db } from './index'
import { ulid } from '@/core/util/id'
import type { Currency } from '@/core/util/money'
import type { Stmt } from '@/core/db/protocol'

/**
 * Sales summaries. Counted sales = POS PAID + Quick SUBMITTED + anything CLOSED.
 * Quick tallies still in DRAFT are "pending" (shown separately, like LomOr).
 * Amounts are converted into the shop's current base currency using each sale's own rate.
 */
const COUNTED = `s.status IN ('PAID','SUBMITTED','CLOSED')`

function conv(col: string, base: Currency) {
  return base === 'KHR'
    ? `(CASE s.currency WHEN 'KHR' THEN ${col} ELSE ROUND(${col} * s.khr_per_usd / 100.0) END)`
    : `(CASE s.currency WHEN 'USD' THEN ${col} ELSE ROUND(${col} * 100.0 / s.khr_per_usd) END)`
}

export interface Summary {
  sales: number // POS tickets + Quick tallies
  posCount: number
  quickCount: number
  items: number
  internalItems: number
  gross: number
  discount: number
  net: number
  cash: number
  khqr: number
  other: number
  quick: number // Quick Sales tally total (no per-ticket payment)
  debt: number // sold on credit (pay later)
  collected: number // debt repayments received in the period
  collectedCash: number // …of which in cash (goes into the cash drawer)
  pending: number // Quick tallies not yet submitted
  pendingCount: number
}

export async function summary(from: string, to: string, base: Currency): Promise<Summary> {
  const r = (await db.get<any>(
    `SELECT
       COUNT(*) AS sales,
       SUM(s.kind = 'POS') AS posCount,
       SUM(s.kind = 'QUICK') AS quickCount,
       COALESCE(SUM(${conv('s.subtotal', base)}), 0) AS gross,
       COALESCE(SUM(${conv('s.discount', base)}), 0) AS discount,
       COALESCE(SUM(${conv('s.total', base)}), 0) AS net,
       COALESCE(SUM(CASE WHEN s.kind = 'QUICK' THEN ${conv('s.total', base)} ELSE 0 END), 0) AS quick
     FROM sale s WHERE s.business_date BETWEEN ? AND ? AND ${COUNTED}`,
    [from, to],
  ))!
  const items = (await db.get<any>(
    `SELECT COALESCE(SUM(CASE WHEN l.internal = 0 THEN l.qty END), 0) AS items,
            COALESCE(SUM(CASE WHEN l.internal = 1 THEN l.qty END), 0) AS internalItems
     FROM sale_line l JOIN sale s ON s.id = l.sale_id
     WHERE s.business_date BETWEEN ? AND ? AND ${COUNTED}`,
    [from, to],
  ))!
  const pays = await db.query<{ method: string; amt: number }>(
    `SELECT p.method, COALESCE(SUM(${conv('p.amount', base)}), 0) AS amt
     FROM payment p JOIN sale s ON s.id = p.sale_id
     WHERE s.business_date BETWEEN ? AND ? AND ${COUNTED} GROUP BY p.method`,
    [from, to],
  )
  const pend = (await db.get<any>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(${conv('s.total', base)}), 0) AS amt FROM sale s
     WHERE s.kind = 'QUICK' AND s.status = 'DRAFT' AND s.business_date BETWEEN ? AND ?
       AND EXISTS (SELECT 1 FROM sale_line l WHERE l.sale_id = s.id)`,
    [from, to],
  ))!
  const by = (m: string) => pays.find((p) => p.method === m)?.amt ?? 0
  const gconv =
    base === 'KHR'
      ? `(CASE g.currency WHEN 'KHR' THEN g.amount ELSE ROUND(g.amount * g.khr_per_usd / 100.0) END)`
      : `(CASE g.currency WHEN 'USD' THEN g.amount ELSE ROUND(g.amount * 100.0 / g.khr_per_usd) END)`
  const col = (await db.get<any>(
    `SELECT COALESCE(SUM(${gconv}), 0) AS amt, COALESCE(SUM(CASE WHEN g.method = 'CASH' THEN ${gconv} ELSE 0 END), 0) AS cash
     FROM customer_ledger g WHERE g.kind = 'PAYMENT' AND g.business_date BETWEEN ? AND ?`,
    [from, to],
  ))!
  return {
    sales: r.sales ?? 0,
    posCount: r.posCount ?? 0,
    quickCount: r.quickCount ?? 0,
    items: items.items,
    internalItems: items.internalItems,
    gross: r.gross,
    discount: r.discount,
    net: r.net,
    cash: by('CASH'),
    khqr: by('KHQR'),
    other: by('CARD') + by('OTHER'),
    quick: r.quick,
    debt: by('DEBT'),
    collected: col.amt,
    collectedCash: col.cash,
    pending: pend.amt,
    pendingCount: pend.n,
  }
}

export interface DayRow {
  date: string
  sales: number
  net: number
  closed: number
}

export function byDay(from: string, to: string, base: Currency): Promise<DayRow[]> {
  return db.query<DayRow>(
    `SELECT s.business_date AS date, COUNT(*) AS sales, COALESCE(SUM(${conv('s.total', base)}), 0) AS net,
            EXISTS (SELECT 1 FROM day_close d WHERE d.business_date = s.business_date) AS closed
     FROM sale s WHERE s.business_date BETWEEN ? AND ? AND ${COUNTED}
     GROUP BY s.business_date ORDER BY s.business_date`,
    [from, to],
  )
}

export interface TopItem {
  name: string
  qty: number
  amount: number
  internal: number
}

export function topItems(from: string, to: string, base: Currency, limit = 20): Promise<TopItem[]> {
  return db.query<TopItem>(
    `SELECT COALESCE(i.name_km || ' / ' || i.name, i.name, l.name) AS name,
            SUM(CASE WHEN l.internal = 0 THEN l.qty ELSE 0 END) AS qty,
            SUM(${conv('l.line_total', base)}) AS amount,
            SUM(CASE WHEN l.internal = 1 THEN l.qty ELSE 0 END) AS internal
     FROM sale_line l JOIN sale s ON s.id = l.sale_id LEFT JOIN item i ON i.id = l.item_id
     WHERE s.business_date BETWEEN ? AND ? AND ${COUNTED}
     GROUP BY COALESCE(l.item_id, l.name) ORDER BY amount DESC, qty DESC LIMIT ?`,
    [from, to, limit],
  )
}

// ── day close (Z-report) ─────────────────────────────────────────────────────
export interface DayClose {
  business_date: string
  currency: Currency
  sale_count: number
  item_count: number
  gross: number
  discount: number
  net: number
  cash: number
  khqr: number
  other: number
  quick: number
  internal_items: number
  debt: number
  collected: number
  note: string | null
  closed_at: number
}

export function getDayClose(date: string): Promise<DayClose | undefined> {
  return db.get<DayClose>(`SELECT * FROM day_close WHERE business_date = ?`, [date])
}

/**
 * Close a day: Quick tallies with items are submitted, empty drafts removed, every
 * counted sale becomes CLOSED, and the totals are frozen in day_close.
 * POS carts still open (DRAFT) are not touched; they will be dated when paid.
 */
export async function closeDay(date: string, base: Currency, note = ''): Promise<DayClose> {
  await db.batch([
    {
      sql: `DELETE FROM sale WHERE kind = 'QUICK' AND status = 'DRAFT' AND business_date = ?
            AND NOT EXISTS (SELECT 1 FROM sale_line l WHERE l.sale_id = sale.id)`,
      bind: [date],
    },
    { sql: `UPDATE sale SET status = 'SUBMITTED', updated_at = ? WHERE kind = 'QUICK' AND status = 'DRAFT' AND business_date = ?`, bind: [Date.now(), date] },
  ])
  const s = await summary(date, date, base)
  const now = Date.now()
  const stmts: Stmt[] = [
    {
      sql: `INSERT INTO day_close (business_date, currency, sale_count, item_count, gross, discount, net, cash, khqr, other, quick, internal_items, debt, collected, note, closed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(business_date) DO UPDATE SET currency = excluded.currency, sale_count = excluded.sale_count,
              item_count = excluded.item_count, gross = excluded.gross, discount = excluded.discount, net = excluded.net,
              cash = excluded.cash, khqr = excluded.khqr, other = excluded.other, quick = excluded.quick,
              internal_items = excluded.internal_items, debt = excluded.debt, collected = excluded.collected, note = excluded.note, closed_at = excluded.closed_at`,
      bind: [date, base, s.sales, s.items, s.gross, s.discount, s.net, s.cash, s.khqr, s.other, s.quick, s.internalItems, s.debt, s.collected, note || null, now],
    },
    { sql: `UPDATE sale SET status = 'CLOSED', closed_at = ?, updated_at = ? WHERE business_date = ? AND status IN ('PAID','SUBMITTED')`, bind: [now, now, date] },
  ]
  await db.batch(stmts)
  return (await getDayClose(date))!
}

/** Re-open a closed day (owner correction). Sales go back to PAID / SUBMITTED. */
export async function reopenDay(date: string): Promise<void> {
  await db.batch([
    { sql: `UPDATE sale SET status = CASE kind WHEN 'POS' THEN 'PAID' ELSE 'SUBMITTED' END, closed_at = NULL, updated_at = ? WHERE business_date = ? AND status = 'CLOSED'`, bind: [Date.now(), date] },
    { sql: `DELETE FROM day_close WHERE business_date = ?`, bind: [date] },
  ])
}

// ── CSV export (opens in Excel / Google Sheets, Khmer-safe UTF-8 with BOM) ──
export async function exportCsv(from: string, to: string): Promise<string> {
  const rows = await db.query<any>(
    `SELECT s.business_date, s.kind, s.number, s.status, s.currency, l.name, l.qty, l.unit_price, l.line_total, l.internal, l.modifiers,
            s.discount, s.total, (SELECT group_concat(method) FROM payment p WHERE p.sale_id = s.id) AS methods, s.note
     FROM sale s JOIN sale_line l ON l.sale_id = s.id
     WHERE s.business_date BETWEEN ? AND ? AND s.status <> 'DRAFT'
     ORDER BY s.business_date, s.created_at, l.sort`,
    [from, to],
  )
  const head = ['date', 'type', 'number', 'status', 'currency', 'item', 'qty', 'unit_price', 'line_total', 'free', 'addons', 'sale_discount', 'sale_total', 'payment', 'note']
  const money = (v: number, cur: string) => (cur === 'USD' ? (v / 100).toFixed(2) : String(v))
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map((r) => {
    let addons = ''
    try {
      addons = r.modifiers ? JSON.parse(r.modifiers).map((m: any) => m.name).join(' + ') : ''
    } catch {
      /* ignore */
    }
    return [
      r.business_date,
      r.kind,
      r.number,
      r.status,
      r.currency,
      r.name,
      r.qty,
      money(r.unit_price, r.currency),
      money(r.line_total, r.currency),
      r.internal ? 'yes' : '',
      addons,
      money(r.discount, r.currency),
      money(r.total, r.currency),
      r.methods,
      r.note,
    ]
      .map(esc)
      .join(',')
  })
  return '﻿' + [head.join(','), ...lines].join('\r\n')
}

/** Log a backup attempt. */
export function logBackup(target: 'DRIVE' | 'FOLDER' | 'DOWNLOAD', ok: boolean, info: { bytes?: number; file?: string; remoteId?: string; error?: string }) {
  return db.run(
    `INSERT INTO backup_log (id, target, status, bytes, file_name, remote_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ulid(), target, ok ? 'OK' : 'ERROR', info.bytes ?? null, info.file ?? null, info.remoteId ?? null, info.error ?? null, Date.now()],
  )
}
