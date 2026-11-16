/**
 * Customers (CRM) data access. Functions take the database first, so they run in the app
 * and in Node tests (scripts/test-crm.mts).
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests

export type ActivityKind = 'CALL' | 'VISIT' | 'MESSAGE' | 'SALE' | 'NOTE'
export type EntryMode = 'activity' | 'charge' | 'payment' | 'followup'

export interface Customer {
  id: string
  name: string
  phone: string | null
  telegram: string | null
  address: string | null
  tags: string | null
  birthday: string | null
  note: string | null
  photo: string | null
  active: number
  created_at: number
  updated_at: number
}

export interface CustomerRow extends Customer {
  owe_khr: number // riel owed (positive = they owe you)
  owe_usd: number // cents owed
  last_at: string | null // last activity date
  next_due: string | null // next open follow-up
}

export interface TimelineRow {
  type: 'activity' | 'ledger' | 'followup'
  id: string
  date: string
  kind: string
  note: string | null
  currency: 'KHR' | 'USD' | null
  amount: number | null
  done_at: number | null
  created_at: number
}

export interface DueRow {
  id: string
  customer_id: string
  name: string
  phone: string | null
  telegram: string | null
  due: string
  note: string | null
}

const now = () => Date.now()
export const tagList = (tags: string | null | undefined) =>
  (tags ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// ── settings ─────────────────────────────────────────────────────────────────
export async function getSettings(db: DbLike): Promise<Record<string, string>> {
  return Object.fromEntries((await db.query<{ key: string; value: string }>(`SELECT key, value FROM setting`)).map((r) => [r.key, r.value]))
}
export function setSetting(db: DbLike, key: string, value: string) {
  return db.run(`INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, now()])
}
export async function setupBook(db: DbLike, name: string) {
  const t = now()
  await db.batch(
    [
      ['book_id', ulid()],
      ['book_name', name],
    ].map(([k, v]) => ({ sql: `INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, bind: [k, v, t] })),
  )
}

// ── customers ────────────────────────────────────────────────────────────────
const OWE = (cur: 'KHR' | 'USD') =>
  `COALESCE((SELECT SUM(CASE kind WHEN 'CHARGE' THEN amount ELSE -amount END) FROM ledger g WHERE g.customer_id = c.id AND g.currency = '${cur}'), 0)`

export interface ListOpts {
  search?: string
  tag?: string | null
  sort?: 'name' | 'owed' | 'recent'
  onlyOwing?: boolean
}

export function listCustomers(db: DbLike, o: ListOpts = {}): Promise<CustomerRow[]> {
  const where = ['c.active = 1']
  const bind: unknown[] = []
  if (o.search?.trim()) {
    const q = `%${o.search.trim()}%`
    where.push(`(c.name LIKE ? OR c.phone LIKE ? OR c.telegram LIKE ? OR c.note LIKE ?)`)
    bind.push(q, q, q, q)
  }
  if (o.tag) {
    where.push(`(',' || REPLACE(COALESCE(c.tags, ''), ', ', ',') || ',') LIKE ?`)
    bind.push(`%,${o.tag},%`)
  }
  const having = o.onlyOwing ? `WHERE owe_khr > 0 OR owe_usd > 0` : ''
  // Sort by debt: dollars weighted at ~4,100 ៛/$ (cents × 41) so both currencies rank together.
  const order = o.sort === 'owed' ? 'owe_khr + owe_usd * 41 DESC, name' : o.sort === 'recent' ? "COALESCE(last_at, '') DESC, updated_at DESC" : 'name COLLATE NOCASE'
  return db.query<CustomerRow>(
    `SELECT * FROM (
       SELECT c.*, ${OWE('KHR')} AS owe_khr, ${OWE('USD')} AS owe_usd,
         (SELECT MAX(date) FROM activity a WHERE a.customer_id = c.id) AS last_at,
         (SELECT MIN(due) FROM followup f WHERE f.customer_id = c.id AND f.done_at IS NULL) AS next_due
       FROM customer c WHERE ${where.join(' AND ')}
     ) ${having} ORDER BY ${order}`,
    bind,
  )
}

export async function getCustomer(db: DbLike, id: string): Promise<CustomerRow | undefined> {
  return db.get<CustomerRow>(
    `SELECT c.*, ${OWE('KHR')} AS owe_khr, ${OWE('USD')} AS owe_usd,
       (SELECT MAX(date) FROM activity a WHERE a.customer_id = c.id) AS last_at,
       (SELECT MIN(due) FROM followup f WHERE f.customer_id = c.id AND f.done_at IS NULL) AS next_due
     FROM customer c WHERE c.id = ?`,
    [id],
  )
}

export type CustomerInput = Partial<Omit<Customer, 'created_at' | 'updated_at'>> & { name: string }

export async function saveCustomer(db: DbLike, c: CustomerInput): Promise<string> {
  const tags = tagList(c.tags).join(', ') || null
  const vals = [c.name.trim(), c.phone?.trim() || null, c.telegram?.trim().replace(/^@/, '') || null, c.address?.trim() || null, tags, c.birthday || null, c.note?.trim() || null, c.photo ?? null]
  if (c.id) {
    await db.run(`UPDATE customer SET name = ?, phone = ?, telegram = ?, address = ?, tags = ?, birthday = ?, note = ?, photo = ?, active = ?, updated_at = ? WHERE id = ?`, [
      ...vals,
      c.active ?? 1,
      now(),
      c.id,
    ])
    return c.id
  }
  const id = ulid()
  const t = now()
  await db.run(
    `INSERT INTO customer (name, phone, telegram, address, tags, birthday, note, photo, id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [...vals, id, t, t],
  )
  return id
}

export function archiveCustomer(db: DbLike, id: string) {
  return db.run(`UPDATE customer SET active = 0, updated_at = ? WHERE id = ?`, [now(), id])
}

export async function allTags(db: DbLike): Promise<string[]> {
  const rows = await db.query<{ tags: string }>(`SELECT tags FROM customer WHERE active = 1 AND tags IS NOT NULL`)
  return [...new Set(rows.flatMap((r) => tagList(r.tags)))].sort((a, b) => a.localeCompare(b))
}

// ── activity, follow-ups, debts ──────────────────────────────────────────────
export async function addActivity(db: DbLike, customerId: string, kind: ActivityKind, date: string, note: string, deviceId: string) {
  const t = now()
  await db.batch([
    { sql: `INSERT INTO activity (id, customer_id, kind, date, note, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, bind: [ulid(), customerId, kind, date, note || null, deviceId, t, t] },
    { sql: `UPDATE customer SET updated_at = ? WHERE id = ?`, bind: [t, customerId] },
  ])
}

export async function addFollowup(db: DbLike, customerId: string, due: string, note: string, deviceId: string) {
  const t = now()
  await db.run(`INSERT INTO followup (id, customer_id, due, note, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [ulid(), customerId, due, note || null, deviceId, t, t])
}

/** Mark a follow-up done (and log it as an activity note). */
export async function completeFollowup(db: DbLike, id: string, deviceId: string) {
  const f = await db.get<{ customer_id: string; note: string | null; due: string }>(`SELECT customer_id, note, due FROM followup WHERE id = ?`, [id])
  if (!f) return
  const t = now()
  const today = new Date().toISOString().slice(0, 10)
  await db.batch([
    { sql: `UPDATE followup SET done_at = ?, updated_at = ? WHERE id = ?`, bind: [t, t, id] },
    { sql: `INSERT INTO activity (id, customer_id, kind, date, note, device_id, created_at, updated_at) VALUES (?, ?, 'NOTE', ?, ?, ?, ?, ?)`, bind: [ulid(), f.customer_id, today, `✓ ${f.note ?? ''}`.trim(), deviceId, t, t] },
  ])
}

export async function snoozeFollowup(db: DbLike, id: string, due: string) {
  await db.run(`UPDATE followup SET due = ?, updated_at = ? WHERE id = ?`, [due, now(), id])
}

export async function addLedger(db: DbLike, customerId: string, kind: 'CHARGE' | 'PAYMENT', currency: 'KHR' | 'USD', amount: number, date: string, note: string, deviceId: string) {
  if (amount <= 0) throw new Error('AMOUNT')
  await db.run(`INSERT INTO ledger (id, customer_id, kind, currency, amount, date, note, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    ulid(),
    customerId,
    kind,
    currency,
    Math.round(amount),
    date,
    note || null,
    deviceId,
    now(),
  ])
}

export async function deleteEntry(db: DbLike, type: TimelineRow['type'], id: string) {
  const table = type === 'activity' ? 'activity' : type === 'ledger' ? 'ledger' : 'followup'
  await db.run(`DELETE FROM ${table} WHERE id = ?`, [id])
}

/** Everything about one customer, newest first. */
export function timeline(db: DbLike, customerId: string): Promise<TimelineRow[]> {
  return db.query<TimelineRow>(
    `SELECT 'activity' AS type, id, date, kind, note, NULL AS currency, NULL AS amount, NULL AS done_at, created_at FROM activity WHERE customer_id = ?
     UNION ALL SELECT 'ledger', id, date, kind, note, currency, amount, NULL, created_at FROM ledger WHERE customer_id = ?
     UNION ALL SELECT 'followup', id, due, 'FOLLOWUP', note, NULL, NULL, done_at, created_at FROM followup WHERE customer_id = ?
     ORDER BY date DESC, created_at DESC`,
    [customerId, customerId, customerId],
  )
}

// ── dashboard ────────────────────────────────────────────────────────────────
/** Open follow-ups due on or before `until` (today → includes overdue). */
export function dueFollowups(db: DbLike, until: string): Promise<DueRow[]> {
  return db.query<DueRow>(
    `SELECT f.id, f.customer_id, c.name, c.phone, c.telegram, f.due, f.note
     FROM followup f JOIN customer c ON c.id = f.customer_id
     WHERE f.done_at IS NULL AND f.due <= ? AND c.active = 1 ORDER BY f.due, c.name`,
    [until],
  )
}

export async function totalsOwed(db: DbLike): Promise<{ khr: number; usd: number; customers: number }> {
  const rows = await listCustomers(db, { onlyOwing: true })
  return { khr: rows.reduce((s, r) => s + Math.max(0, r.owe_khr), 0), usd: rows.reduce((s, r) => s + Math.max(0, r.owe_usd), 0), customers: rows.length }
}

/** Customers whose birthday (MM-DD) falls in the next `days` days. */
export async function birthdaysSoon(db: DbLike, today: Date, days = 14): Promise<(Customer & { inDays: number })[]> {
  const rows = await db.query<Customer>(`SELECT * FROM customer WHERE active = 1 AND birthday IS NOT NULL`)
  const out: (Customer & { inDays: number })[] = []
  for (const r of rows) {
    const md = r.birthday!.slice(-5)
    const [m, d] = md.split('-').map(Number)
    if (!m || !d) continue
    let next = new Date(today.getFullYear(), m - 1, d)
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (next < t0) next = new Date(today.getFullYear() + 1, m - 1, d)
    const inDays = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
    if (inDays <= days) out.push({ ...r, inDays })
  }
  return out.sort((a, b) => a.inDays - b.inDays)
}

// ── CSV ──────────────────────────────────────────────────────────────────────
const CSV_HEAD = ['name', 'phone', 'telegram', 'address', 'tags', 'birthday', 'note', 'owe_khr', 'owe_usd']

export async function exportCsv(db: DbLike): Promise<string> {
  const rows = await listCustomers(db)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [CSV_HEAD.join(','), ...rows.map((r) => [r.name, r.phone, r.telegram, r.address, r.tags, r.birthday, r.note, r.owe_khr, (r.owe_usd / 100).toFixed(2)].map(esc).join(','))].join('\r\n')
}

/** Minimal CSV parser (quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Import customers from CSV (header row with at least "name"). Skips names that already exist. */
export async function importCsv(db: DbLike, text: string): Promise<{ added: number; skipped: number }> {
  const rows = parseCsv(text)
  if (!rows.length) return { added: 0, skipped: 0 }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (n: string) => head.indexOf(n)
  if (col('name') < 0) throw new Error('NO_NAME_COLUMN')
  const existing = new Set((await db.query<{ n: string }>(`SELECT lower(name) AS n FROM customer`)).map((r) => r.n))
  let added = 0
  let skipped = 0
  for (const r of rows.slice(1)) {
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '')
    const name = get('name')
    if (!name || existing.has(name.toLowerCase())) {
      skipped++
      continue
    }
    await saveCustomer(db, { name, phone: get('phone'), telegram: get('telegram'), address: get('address'), tags: get('tags'), birthday: get('birthday') || null, note: get('note') })
    existing.add(name.toLowerCase())
    added++
  }
  return { added, skipped }
}

export async function referencedPhotos(db: DbLike): Promise<string[]> {
  return (await db.query<{ p: string }>(`SELECT photo AS p FROM customer WHERE photo IS NOT NULL`)).map((r) => r.p)
}
