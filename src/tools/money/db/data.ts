/**
 * Income & Expense data access. Every function takes the database as its first argument
 * so the same code runs in the app (SqliteClient) and in Node tests (scripts/test-money.mts).
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import type { Currency } from '@/core/util/money'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests

export type TxnKind = 'IN' | 'OUT' | 'MOVE'
export type AccountKind = 'CASH' | 'BANK' | 'WALLET' | 'OTHER'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  currency: Currency
  opening: number
  sort: number
  active: number
}

export interface AccountBalance extends Account {
  balance: number // account currency, minor units
}

export interface Category {
  id: string
  kind: 'IN' | 'OUT'
  name: string
  name_km: string | null
  icon: string | null
  sort: number
  active: number
}

export interface Txn {
  id: string
  kind: TxnKind
  date: string
  account_id: string
  to_account_id: string | null
  category_id: string | null
  amount: number
  to_amount: number | null
  khr_per_usd: number
  note: string | null
  photo: string | null
  created_at: number
  updated_at: number
}

export interface TxnRow extends Txn {
  account_name: string
  account_currency: Currency
  to_account_name: string | null
  to_currency: Currency | null
  category_name: string | null
  category_name_km: string | null
  category_icon: string | null
}

/** SQL: an amount in `curCol` currency converted into the base currency with the txn's own rate. */
function conv(amountCol: string, curCol: string, base: Currency) {
  return base === 'KHR'
    ? `(CASE ${curCol} WHEN 'KHR' THEN ${amountCol} ELSE ROUND(${amountCol} * t.khr_per_usd / 100.0) END)`
    : `(CASE ${curCol} WHEN 'USD' THEN ${amountCol} ELSE ROUND(${amountCol} * 100.0 / t.khr_per_usd) END)`
}

// ── setup ────────────────────────────────────────────────────────────────────
export const DEFAULT_CATEGORIES: { kind: 'IN' | 'OUT'; name: string; name_km: string; icon: string }[] = [
  { kind: 'IN', name: 'Sales', name_km: 'ការលក់', icon: '🛒' },
  { kind: 'IN', name: 'Services', name_km: 'សេវាកម្ម', icon: '🧰' },
  { kind: 'IN', name: 'Debt collected', name_km: 'ប្រមូលបំណុល', icon: '📥' },
  { kind: 'IN', name: 'Loan received', name_km: 'ទទួលប្រាក់កម្ចី', icon: '🏦' },
  { kind: 'IN', name: 'Owner added money', name_km: 'ម្ចាស់ដាក់ទុនបន្ថែម', icon: '💼' },
  { kind: 'IN', name: 'Other income', name_km: 'ចំណូលផ្សេងៗ', icon: '➕' },
  { kind: 'OUT', name: 'Stock & ingredients', name_km: 'ទិញទំនិញ និងគ្រឿងផ្សំ', icon: '📦' },
  { kind: 'OUT', name: 'Rent', name_km: 'ថ្លៃជួល', icon: '🏠' },
  { kind: 'OUT', name: 'Salaries', name_km: 'ប្រាក់ខែបុគ្គលិក', icon: '👥' },
  { kind: 'OUT', name: 'Electricity & water', name_km: 'ភ្លើង និងទឹក', icon: '💡' },
  { kind: 'OUT', name: 'Phone & internet', name_km: 'ទូរស័ព្ទ និងអ៊ីនធឺណិត', icon: '📶' },
  { kind: 'OUT', name: 'Transport & delivery', name_km: 'ដឹកជញ្ជូន', icon: '🛵' },
  { kind: 'OUT', name: 'Equipment & repairs', name_km: 'សម្ភារៈ និងជួសជុល', icon: '🔧' },
  { kind: 'OUT', name: 'Marketing', name_km: 'ផ្សព្វផ្សាយ', icon: '📣' },
  { kind: 'OUT', name: 'Loan repayment', name_km: 'សងប្រាក់កម្ចី', icon: '🏦' },
  { kind: 'OUT', name: 'Tax & fees', name_km: 'ពន្ធ និងកម្រៃ', icon: '🧾' },
  { kind: 'OUT', name: 'Owner took money', name_km: 'ម្ចាស់ដកប្រាក់', icon: '👛' },
  { kind: 'OUT', name: 'Other expense', name_km: 'ចំណាយផ្សេងៗ', icon: '➖' },
]

/** First run: business name, default accounts and categories. */
export async function setupBook(db: DbLike, name: string, base: Currency, khrPerUsd: number, accounts: { name: string; kind: AccountKind; currency: Currency; opening: number }[]) {
  const now = Date.now()
  const stmts = [
    ...[
      ['book_id', ulid()],
      ['book_name', name],
      ['base_currency', base],
      ['khr_per_usd', String(khrPerUsd)],
    ].map(([k, v]) => ({ sql: `INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, bind: [k, v, now] })),
    ...accounts.map((a, i) => ({
      sql: `INSERT INTO account (id, name, kind, currency, opening, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      bind: [ulid(), a.name, a.kind, a.currency, a.opening, i, now, now],
    })),
    ...DEFAULT_CATEGORIES.map((c, i) => ({
      sql: `INSERT INTO category (id, kind, name, name_km, icon, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      bind: [ulid(), c.kind, c.name, c.name_km, c.icon, i, now, now],
    })),
  ]
  await db.batch(stmts)
}

export async function getSettings(db: DbLike): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM setting`)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setSetting(db: DbLike, key: string, value: string) {
  return db.run(`INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, Date.now()])
}

// ── accounts ─────────────────────────────────────────────────────────────────
export function balances(db: DbLike): Promise<AccountBalance[]> {
  return db.query<AccountBalance>(
    `SELECT a.*, a.opening
       + COALESCE((SELECT SUM(amount) FROM txn WHERE account_id = a.id AND kind = 'IN'), 0)
       - COALESCE((SELECT SUM(amount) FROM txn WHERE account_id = a.id AND kind IN ('OUT','MOVE')), 0)
       + COALESCE((SELECT SUM(to_amount) FROM txn WHERE to_account_id = a.id AND kind = 'MOVE'), 0) AS balance
     FROM account a ORDER BY a.active DESC, a.sort, a.name`,
  )
}

export async function saveAccount(db: DbLike, a: Partial<Account> & { name: string; currency: Currency }): Promise<string> {
  const now = Date.now()
  if (a.id) {
    await db.run(`UPDATE account SET name = ?, kind = ?, opening = ?, active = ?, updated_at = ? WHERE id = ?`, [a.name, a.kind ?? 'CASH', a.opening ?? 0, a.active ?? 1, now, a.id])
    return a.id
  }
  const id = ulid()
  await db.run(
    `INSERT INTO account (id, name, kind, currency, opening, sort, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM account), 1, ?, ?)`,
    [id, a.name, a.kind ?? 'CASH', a.currency, a.opening ?? 0, now, now],
  )
  return id
}

// ── categories ───────────────────────────────────────────────────────────────
export function listCategories(db: DbLike): Promise<Category[]> {
  return db.query<Category>(`SELECT * FROM category ORDER BY kind, sort, name`)
}

export async function saveCategory(db: DbLike, c: Partial<Category> & { name: string; kind: 'IN' | 'OUT' }): Promise<string> {
  const now = Date.now()
  if (c.id) {
    await db.run(`UPDATE category SET name = ?, name_km = ?, icon = ?, active = ?, updated_at = ? WHERE id = ?`, [c.name, c.name_km ?? null, c.icon ?? null, c.active ?? 1, now, c.id])
    return c.id
  }
  const id = ulid()
  await db.run(
    `INSERT INTO category (id, kind, name, name_km, icon, sort, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM category), 1, ?, ?)`,
    [id, c.kind, c.name, c.name_km ?? null, c.icon ?? null, now, now],
  )
  return id
}

// ── transactions ─────────────────────────────────────────────────────────────
export interface TxnInput {
  id?: string
  kind: TxnKind
  date: string
  account_id: string
  to_account_id?: string | null
  category_id?: string | null
  amount: number
  to_amount?: number | null
  khr_per_usd: number
  note?: string | null
  photo?: string | null
}

export async function saveTxn(db: DbLike, t: TxnInput, deviceId: string): Promise<string> {
  if (t.amount <= 0) throw new Error('AMOUNT')
  if (t.kind === 'MOVE' && (!t.to_account_id || t.to_account_id === t.account_id)) throw new Error('TO_ACCOUNT')
  const now = Date.now()
  const vals = [
    t.kind,
    t.date,
    t.account_id,
    t.kind === 'MOVE' ? t.to_account_id : null,
    t.kind === 'MOVE' ? null : (t.category_id ?? null),
    Math.round(t.amount),
    t.kind === 'MOVE' ? Math.round(t.to_amount ?? t.amount) : null,
    t.khr_per_usd,
    t.note || null,
    t.photo || null,
  ]
  if (t.id) {
    await db.run(
      `UPDATE txn SET kind = ?, date = ?, account_id = ?, to_account_id = ?, category_id = ?, amount = ?, to_amount = ?, khr_per_usd = ?, note = ?, photo = ?, updated_at = ? WHERE id = ?`,
      [...vals, now, t.id],
    )
    return t.id
  }
  const id = ulid()
  await db.run(
    `INSERT INTO txn (kind, date, account_id, to_account_id, category_id, amount, to_amount, khr_per_usd, note, photo, id, device_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...vals, id, deviceId, now, now],
  )
  return id
}

export function deleteTxn(db: DbLike, id: string) {
  return db.run(`DELETE FROM txn WHERE id = ?`, [id])
}

export function listTxns(db: DbLike, from: string, to: string, opts: { accountId?: string; categoryId?: string; search?: string } = {}): Promise<TxnRow[]> {
  const where = [`t.date BETWEEN ? AND ?`]
  const bind: unknown[] = [from, to]
  if (opts.accountId) {
    where.push(`(t.account_id = ? OR t.to_account_id = ?)`)
    bind.push(opts.accountId, opts.accountId)
  }
  if (opts.categoryId) {
    where.push(`t.category_id = ?`)
    bind.push(opts.categoryId)
  }
  if (opts.search?.trim()) {
    where.push(`(t.note LIKE ? OR c.name LIKE ? OR c.name_km LIKE ?)`)
    const q = `%${opts.search.trim()}%`
    bind.push(q, q, q)
  }
  return db.query<TxnRow>(
    `SELECT t.*, a.name AS account_name, a.currency AS account_currency, b.name AS to_account_name, b.currency AS to_currency,
            c.name AS category_name, c.name_km AS category_name_km, c.icon AS category_icon
     FROM txn t JOIN account a ON a.id = t.account_id LEFT JOIN account b ON b.id = t.to_account_id LEFT JOIN category c ON c.id = t.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.date DESC, t.created_at DESC`,
    bind,
  )
}

// ── reports (transfers are neither income nor expense) ───────────────────────
export interface Totals {
  income: number
  expense: number
  net: number
  count: number
}

export async function totals(db: DbLike, from: string, to: string, base: Currency): Promise<Totals> {
  const r = (await db.get<any>(
    `SELECT COALESCE(SUM(CASE WHEN t.kind = 'IN' THEN ${conv('t.amount', 'a.currency', base)} END), 0) AS income,
            COALESCE(SUM(CASE WHEN t.kind = 'OUT' THEN ${conv('t.amount', 'a.currency', base)} END), 0) AS expense,
            SUM(t.kind <> 'MOVE') AS count
     FROM txn t JOIN account a ON a.id = t.account_id WHERE t.date BETWEEN ? AND ?`,
    [from, to],
  ))!
  return { income: r.income, expense: r.expense, net: r.income - r.expense, count: r.count ?? 0 }
}

export interface CategoryTotal {
  category_id: string | null
  name: string | null
  name_km: string | null
  icon: string | null
  kind: 'IN' | 'OUT'
  total: number
  count: number
}

export function byCategory(db: DbLike, from: string, to: string, base: Currency): Promise<CategoryTotal[]> {
  return db.query<CategoryTotal>(
    `SELECT t.category_id, c.name, c.name_km, c.icon, t.kind, SUM(${conv('t.amount', 'a.currency', base)}) AS total, COUNT(*) AS count
     FROM txn t JOIN account a ON a.id = t.account_id LEFT JOIN category c ON c.id = t.category_id
     WHERE t.date BETWEEN ? AND ? AND t.kind <> 'MOVE'
     GROUP BY t.kind, t.category_id ORDER BY t.kind, total DESC`,
    [from, to],
  )
}

export interface MonthTotal {
  month: string // 'YYYY-MM'
  income: number
  expense: number
}

export function byMonth(db: DbLike, year: number, base: Currency): Promise<MonthTotal[]> {
  return db.query<MonthTotal>(
    `SELECT substr(t.date, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN t.kind = 'IN' THEN ${conv('t.amount', 'a.currency', base)} END), 0) AS income,
            COALESCE(SUM(CASE WHEN t.kind = 'OUT' THEN ${conv('t.amount', 'a.currency', base)} END), 0) AS expense
     FROM txn t JOIN account a ON a.id = t.account_id
     WHERE t.date BETWEEN ? AND ? GROUP BY month ORDER BY month`,
    [`${year}-01-01`, `${year}-12-31`],
  )
}

/** CSV for Excel (UTF-8 with BOM so Khmer shows correctly). */
export async function exportCsv(db: DbLike, from: string, to: string): Promise<string> {
  const rows = await listTxns(db, from, to)
  const money = (v: number | null, cur: string | null) => (v == null ? '' : cur === 'USD' ? (v / 100).toFixed(2) : String(v))
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['date', 'type', 'account', 'currency', 'amount', 'to_account', 'to_amount', 'category', 'note']
  const lines = rows
    .slice()
    .reverse()
    .map((r) =>
      [r.date, r.kind, r.account_name, r.account_currency, money(r.amount, r.account_currency), r.to_account_name, money(r.to_amount, r.to_currency), r.category_name_km || r.category_name, r.note]
        .map(esc)
        .join(','),
    )
  return '﻿' + [head.join(','), ...lines].join('\r\n')
}

/** Every photo path the database references (for backups). */
export async function referencedPhotos(db: DbLike): Promise<string[]> {
  return (await db.query<{ p: string }>(`SELECT DISTINCT photo AS p FROM txn WHERE photo IS NOT NULL`)).map((r) => r.p)
}
