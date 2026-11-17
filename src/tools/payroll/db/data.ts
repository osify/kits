/**
 * Payroll data access. Functions take the database first, so they run in the app and in Node tests
 * (scripts/test-payroll.mts). Tax rules come from the Finance tool (src/tools/finance/tax.ts), so the
 * single-employee calculator and the monthly payroll always agree.
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests
import { rielToCents, type Currency } from '../../../core/util/money.ts'
import { payroll } from '../../finance/tax.ts'
import { EFILING_DAY, FILING_DAY } from '../../finance/rates.ts'

export interface Staff {
  id: string
  code: string
  name: string
  name_latin: string | null
  sex: 'M' | 'F' | null
  position: string | null
  nationality: string | null
  id_no: string | null
  nssf_no: string | null
  phone: string | null
  bank: string | null
  resident: number
  children: number
  spouse: number
  nssf_covered: number
  salary: number
  currency: Currency
  start_date: string | null
  end_date: string | null
  note: string | null
}
export interface Run {
  month: string
  khr_per_usd: number
  status: 'OPEN' | 'CLOSED'
  closed_at: number | null
}
export interface Line {
  id: string
  month: string
  staff_id: string
  code: string
  name: string
  position: string | null
  nationality: string | null
  resident: number
  children: number
  spouse: number
  nssf_covered: number
  currency: Currency
  salary: number
  bonus: number
  seniority: number
  seniority_times: number
  fringe: number
  pension_fund: number
  deduction: number
  note: string | null
  gross_khr: number
  taxable_khr: number
  pension_khr: number
  allowance_khr: number
  base_khr: number
  tax_khr: number
  nssf_risk_khr: number
  nssf_health_khr: number
  nssf_pension_er_khr: number
  fringe_khr: number
  fbt_khr: number
  net_khr: number
  cost_khr: number
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
    ].map(([k, v]) => ({ sql: `INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, bind: [k, v, t] })),
  )
}

// ── Staff ───────────────────────────────────────────────────────────────────

async function nextCode(db: DbLike) {
  const rows = await db.query<{ code: string }>(`SELECT code FROM staff WHERE code LIKE 'E-%'`)
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(2)) || 0), 0)
  return `E-${String(max + 1).padStart(3, '0')}`
}
const STAFF_COLS = ['name', 'name_latin', 'sex', 'position', 'nationality', 'id_no', 'nssf_no', 'phone', 'bank', 'resident', 'children', 'spouse', 'nssf_covered', 'salary', 'currency', 'start_date', 'end_date', 'note'] as const
export async function saveStaff(db: DbLike, s: Partial<Staff> & { name: string; salary: number; currency: Currency }): Promise<string> {
  const t = now()
  const v = {
    ...s,
    name: s.name.trim(),
    name_latin: clean(s.name_latin), position: clean(s.position), nationality: clean(s.nationality), id_no: clean(s.id_no), nssf_no: clean(s.nssf_no),
    phone: clean(s.phone), bank: clean(s.bank), note: clean(s.note), sex: s.sex || null, start_date: s.start_date || null, end_date: s.end_date || null,
    resident: s.resident ?? 1, children: Math.max(0, Math.floor(s.children ?? 0)), spouse: s.spouse ? 1 : 0, nssf_covered: s.nssf_covered ?? 1,
  } as Record<string, unknown>
  const vals = STAFF_COLS.map((c) => v[c] ?? null)
  if (s.id) {
    await db.run(`UPDATE staff SET ${STAFF_COLS.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`, [...vals, t, s.id])
    return s.id
  }
  const id = ulid()
  await db.run(`INSERT INTO staff (${STAFF_COLS.join(', ')}, id, code, created_at, updated_at) VALUES (${STAFF_COLS.map(() => '?').join(',')},?,?,?,?)`, [...vals, id, await nextCode(db), t, t])
  return id
}
export function getStaff(db: DbLike, id: string) {
  return db.get<Staff>(`SELECT * FROM staff WHERE id = ?`, [id])
}
/** Everyone, or only those working in `month` (started on/before its end, not left before its start). */
export function listStaff(db: DbLike, month?: string) {
  if (!month) return db.query<Staff>(`SELECT * FROM staff ORDER BY (end_date IS NOT NULL), code`)
  return db.query<Staff>(
    `SELECT * FROM staff WHERE (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY code`,
    [`${month}-31`, `${month}-01`],
  )
}
/** Delete a staff member who is on no payroll yet; otherwise set a leaving date instead. */
export async function deleteStaff(db: DbLike, id: string) {
  const used = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM run_line WHERE staff_id = ?`, [id])
  if (used?.n) throw new Error('ON_PAYROLL')
  await db.run(`DELETE FROM staff WHERE id = ?`, [id])
}

// ── Monthly payroll ─────────────────────────────────────────────────────────

/** Fill a line's riel results from its inputs, at the month's rate (rules of that month). */
export function computeLine(l: Omit<Line, 'id' | 'staff_id'> & Partial<Pick<Line, 'id' | 'staff_id'>>, rate: number) {
  const khr = (v: number) => (l.currency === 'KHR' ? v : Math.round((v / 100) * rate))
  const r = payroll({
    gross: khr(l.salary), month: l.month, resident: !!l.resident, children: l.children, spouse: !!l.spouse, nssfCovered: !!l.nssf_covered,
    fringe: khr(l.fringe), bonus: khr(l.bonus), seniority: khr(l.seniority), seniorityTimes: l.seniority_times === 1 ? 1 : 2, pensionFund: khr(l.pension_fund),
  })
  return {
    gross_khr: khr(l.salary) + khr(l.bonus) + khr(l.seniority),
    taxable_khr: r.taxable,
    pension_khr: r.tax.pension,
    allowance_khr: r.tax.allowances,
    base_khr: r.tax.base,
    tax_khr: r.tax.tax,
    nssf_risk_khr: r.nssf?.occupationalRisk ?? 0,
    nssf_health_khr: r.nssf?.healthCare ?? 0,
    nssf_pension_er_khr: r.nssf?.pensionEmployer ?? 0,
    fringe_khr: r.fringeTotal,
    fbt_khr: r.fbt,
    net_khr: r.net - khr(l.deduction),
    cost_khr: r.employerCost,
  }
}
/** Net pay in the staff member's own currency (dollar salaries are paid in dollars). */
export function netIn(l: Pick<Line, 'net_khr' | 'currency'>, rate: number) {
  return l.currency === 'KHR' ? l.net_khr : rielToCents(l.net_khr, rate)
}

const RESULT_COLS = ['gross_khr', 'taxable_khr', 'pension_khr', 'allowance_khr', 'base_khr', 'tax_khr', 'nssf_risk_khr', 'nssf_health_khr', 'nssf_pension_er_khr', 'fringe_khr', 'fbt_khr', 'net_khr', 'cost_khr'] as const
async function writeResults(db: DbLike, l: Line, rate: number) {
  const r = computeLine(l, rate)
  await db.run(`UPDATE run_line SET ${RESULT_COLS.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`, [...RESULT_COLS.map((c) => r[c]), now(), l.id])
}

export function getRun(db: DbLike, month: string) {
  return db.get<Run>(`SELECT * FROM run WHERE month = ?`, [month])
}
export function listRuns(db: DbLike) {
  return db.query<Run>(`SELECT * FROM run ORDER BY month DESC`)
}
export function listLines(db: DbLike, month: string) {
  return db.query<Line>(`SELECT * FROM run_line WHERE month = ? ORDER BY code`, [month])
}
async function insertLine(db: DbLike, month: string, s: Staff, rate: number) {
  const t = now()
  const id = ulid()
  await db.run(
    `INSERT INTO run_line (id, month, staff_id, code, name, position, nationality, resident, children, spouse, nssf_covered, currency, salary, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, month, s.id, s.code, s.name, s.position, s.nationality, s.resident, s.children, s.spouse, s.nssf_covered, s.currency, s.salary, t, t],
  )
  await writeResults(db, (await db.get<Line>(`SELECT * FROM run_line WHERE id = ?`, [id]))!, rate)
}
/** Start a month: one line per staff member working that month, with their usual salary. */
export async function startRun(db: DbLike, month: string, rate: number) {
  if (await getRun(db, month)) return
  const t = now()
  await db.run(`INSERT INTO run (month, khr_per_usd, status, created_at, updated_at) VALUES (?,?,'OPEN',?,?)`, [month, rate, t, t])
  for (const s of await listStaff(db, month)) await insertLine(db, month, s, rate)
}
/** Staff working this month who are not on its payroll yet. */
export async function missingStaff(db: DbLike, month: string) {
  const have = new Set((await listLines(db, month)).map((l) => l.staff_id))
  return (await listStaff(db, month)).filter((s) => !have.has(s.id))
}
async function assertOpen(db: DbLike, month: string) {
  const r = await getRun(db, month)
  if (!r) throw new Error('NO_RUN')
  if (r.status === 'CLOSED') throw new Error('CLOSED')
  return r
}
export async function addToRun(db: DbLike, month: string, staffId: string) {
  const r = await assertOpen(db, month)
  const s = await getStaff(db, staffId)
  if (s && !(await db.get(`SELECT 1 FROM run_line WHERE month = ? AND staff_id = ?`, [month, staffId]))) await insertLine(db, month, s, r.khr_per_usd)
}
export async function removeFromRun(db: DbLike, lineId: string) {
  const l = await db.get<Line>(`SELECT * FROM run_line WHERE id = ?`, [lineId])
  if (!l) return
  await assertOpen(db, l.month)
  await db.run(`DELETE FROM run_line WHERE id = ?`, [lineId])
}
const INPUT_COLS = ['salary', 'bonus', 'seniority', 'seniority_times', 'fringe', 'pension_fund', 'deduction', 'note', 'resident', 'children', 'spouse', 'nssf_covered'] as const
export type LineInput = Partial<Pick<Line, (typeof INPUT_COLS)[number]>>
/** Change this month's amounts for one person, then recompute their tax. */
export async function updateLine(db: DbLike, lineId: string, f: LineInput) {
  const l = await db.get<Line>(`SELECT * FROM run_line WHERE id = ?`, [lineId])
  if (!l) return
  const r = await assertOpen(db, l.month)
  const cols = INPUT_COLS.filter((c) => c in f)
  if (cols.length) await db.run(`UPDATE run_line SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id = ?`, [...cols.map((c) => (f as any)[c] ?? null), lineId])
  await writeResults(db, (await db.get<Line>(`SELECT * FROM run_line WHERE id = ?`, [lineId]))!, r.khr_per_usd)
}
/** New exchange rate for the month's dollar salaries: every line is recomputed. */
export async function setRunRate(db: DbLike, month: string, rate: number) {
  await assertOpen(db, month)
  await db.run(`UPDATE run SET khr_per_usd = ?, updated_at = ? WHERE month = ?`, [rate, now(), month])
  for (const l of await listLines(db, month)) await writeResults(db, l, rate)
}
/** Refresh lines from the staff list (salary, residency, dependants) while the month is open. */
export async function refreshFromStaff(db: DbLike, month: string) {
  const r = await assertOpen(db, month)
  for (const l of await listLines(db, month)) {
    const s = await getStaff(db, l.staff_id)
    if (!s) continue
    await db.run(
      `UPDATE run_line SET code=?, name=?, position=?, nationality=?, resident=?, children=?, spouse=?, nssf_covered=?, currency=?, salary=? WHERE id=?`,
      [s.code, s.name, s.position, s.nationality, s.resident, s.children, s.spouse, s.nssf_covered, s.currency, s.salary, l.id],
    )
    await writeResults(db, (await db.get<Line>(`SELECT * FROM run_line WHERE id = ?`, [l.id]))!, r.khr_per_usd)
  }
}
export async function closeRun(db: DbLike, month: string) {
  await db.run(`UPDATE run SET status = 'CLOSED', closed_at = ?, updated_at = ? WHERE month = ?`, [now(), now(), month])
}
export async function reopenRun(db: DbLike, month: string) {
  await db.run(`UPDATE run SET status = 'OPEN', closed_at = NULL, updated_at = ? WHERE month = ?`, [now(), month])
}
export async function deleteRun(db: DbLike, month: string) {
  await assertOpen(db, month)
  await db.batch([
    { sql: `DELETE FROM run_line WHERE month = ?`, bind: [month] },
    { sql: `DELETE FROM run WHERE month = ?`, bind: [month] },
  ])
}

// ── The monthly return ──────────────────────────────────────────────────────

export interface ReturnGroup {
  count: number
  gross: number // salary + bonus + seniority paid
  exempt: number // exempt seniority
  pension: number // employee NSSF pension taken off
  allowances: number
  base: number
  tax: number
}
export interface ReturnSummary {
  residents: ReturnGroup
  nonResidents: ReturnGroup
  fringe: { count: number; value: number; fbt: number }
  nssf: { count: number; risk: number; health: number; pensionEmployer: number; pensionEmployee: number; total: number }
  taxTotal: number // tax on salary + FBT to pay GDT
  net: number
  cost: number
  dueDate: string // paper return
  eDueDate: string // GDT e-Filing
}
/** Totals for the GDT Tax on Salary return and the NSSF contribution of a month. */
export function returnSummary(lines: Line[], month: string): ReturnSummary {
  const group = (ls: Line[]): ReturnGroup => ({
    count: ls.length,
    gross: ls.reduce((s, l) => s + l.gross_khr, 0),
    exempt: ls.reduce((s, l) => s + (l.gross_khr - l.taxable_khr), 0),
    pension: ls.reduce((s, l) => s + l.pension_khr, 0),
    allowances: ls.reduce((s, l) => s + l.allowance_khr, 0),
    base: ls.reduce((s, l) => s + l.base_khr, 0),
    tax: ls.reduce((s, l) => s + l.tax_khr, 0),
  })
  const residents = group(lines.filter((l) => l.resident))
  const nonResidents = group(lines.filter((l) => !l.resident))
  const fl = lines.filter((l) => l.fringe_khr > 0)
  const nl = lines.filter((l) => l.nssf_covered)
  const sum = (ls: Line[], k: keyof Line) => ls.reduce((s, l) => s + (l[k] as number), 0)
  const nssf = { count: nl.length, risk: sum(nl, 'nssf_risk_khr'), health: sum(nl, 'nssf_health_khr'), pensionEmployer: sum(nl, 'nssf_pension_er_khr'), pensionEmployee: sum(nl, 'pension_khr'), total: 0 }
  nssf.total = nssf.risk + nssf.health + nssf.pensionEmployer + nssf.pensionEmployee
  const fbt = sum(fl, 'fbt_khr')
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return {
    residents,
    nonResidents,
    fringe: { count: fl.length, value: sum(fl, 'fringe_khr'), fbt },
    nssf,
    taxTotal: residents.tax + nonResidents.tax + fbt,
    net: sum(lines, 'net_khr'),
    cost: sum(lines, 'cost_khr'),
    dueDate: `${next}-${String(FILING_DAY).padStart(2, '0')}`,
    eDueDate: `${next}-${String(EFILING_DAY).padStart(2, '0')}`,
  }
}

export interface YearRow {
  month: string
  status: 'OPEN' | 'CLOSED'
  staff: number
  gross: number
  tax: number
  fbt: number
  nssf: number
  net: number
  cost: number
}
export function yearReport(db: DbLike, year: string) {
  return db.query<YearRow>(
    `SELECT r.month, r.status, COUNT(l.id) AS staff, COALESCE(SUM(l.gross_khr),0) AS gross, COALESCE(SUM(l.tax_khr),0) AS tax, COALESCE(SUM(l.fbt_khr),0) AS fbt,
       COALESCE(SUM(l.nssf_risk_khr + l.nssf_health_khr + l.nssf_pension_er_khr + l.pension_khr),0) AS nssf, COALESCE(SUM(l.net_khr),0) AS net, COALESCE(SUM(l.cost_khr),0) AS cost
     FROM run r LEFT JOIN run_line l ON l.month = r.month WHERE substr(r.month,1,4) = ? GROUP BY r.month ORDER BY r.month`,
    [year],
  )
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** One row per employee for the month, amounts in riel (the GDT return annex / accountant). */
export async function monthCsv(db: DbLike, month: string): Promise<string> {
  const lines = await listLines(db, month)
  const run = await getRun(db, month)
  const staff = new Map((await listStaff(db)).map((s) => [s.id, s]))
  const head = ['month', 'code', 'name', 'name_latin', 'position', 'nationality', 'id_no', 'nssf_no', 'resident', 'dependants', 'currency', 'salary', 'bonus', 'seniority', 'khr_per_usd',
    'gross_khr', 'exempt_khr', 'nssf_pension_employee_khr', 'allowances_khr', 'tax_base_khr', 'tax_on_salary_khr', 'fringe_khr', 'fbt_khr',
    'nssf_occupational_khr', 'nssf_health_khr', 'nssf_pension_employer_khr', 'deduction', 'net_khr', 'net', 'employer_cost_khr']
  const amt = (v: number, c: Currency) => (c === 'KHR' ? String(v) : (v / 100).toFixed(2))
  const rate = run?.khr_per_usd ?? 4100
  return (
    '﻿' +
    [
      head.join(','),
      ...lines.map((l) => {
        const s = staff.get(l.staff_id)
        return [month, l.code, l.name, s?.name_latin, l.position, l.nationality, s?.id_no, s?.nssf_no, l.resident ? 'Y' : 'N', l.children + l.spouse, l.currency,
          amt(l.salary, l.currency), amt(l.bonus, l.currency), amt(l.seniority, l.currency), rate, l.gross_khr, l.gross_khr - l.taxable_khr, l.pension_khr, l.allowance_khr,
          l.base_khr, l.tax_khr, l.fringe_khr, l.fbt_khr, l.nssf_risk_khr, l.nssf_health_khr, l.nssf_pension_er_khr, amt(l.deduction, l.currency), l.net_khr,
          amt(netIn(l, rate), l.currency), l.cost_khr].map(esc).join(',')
      }),
    ].join('\r\n') +
    '\r\n'
  )
}
