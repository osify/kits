/**
 * Health data access. Functions take the database first, so they run in the app and in Node
 * tests (scripts/test-health.mts). Every write bumps updated_at.
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests
import type { Kind, MedLike } from '../rules.ts'

export interface Person {
  id: string
  name: string
  relation: string | null
  birth_date: string | null
  sex: 'M' | 'F' | null
  blood_type: string | null
  allergies: string | null
  conditions: string | null
  note: string | null
  photo: string | null
  color: string | null
  sort: number
  active: number
}
export interface Reading {
  id: string
  person_id: string
  kind: Kind
  v1: number
  v2: number | null
  context: string | null
  taken_at: number
  note: string | null
}
export interface Medicine extends MedLike {
  note: string | null
}
export interface Appointment {
  id: string
  person_id: string
  date: string
  time: string | null
  place: string | null
  doctor: string | null
  reason: string | null
  note: string | null
  done_at: number | null
}
export type RecordKind = 'VACCINE' | 'VISIT' | 'LAB' | 'RX' | 'NOTE'
export interface HealthRecord {
  id: string
  person_id: string
  kind: RecordKind
  date: string
  title: string
  note: string | null
  photo: string | null
  next_due: string | null
}

const now = () => Date.now()
const clean = (v: string | null | undefined) => (v ?? '').trim() || null

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

// ── People ──────────────────────────────────────────────────────────────────

export async function listPeople(db: DbLike, all = false): Promise<Person[]> {
  return db.query<Person>(`SELECT * FROM person ${all ? '' : 'WHERE active = 1'} ORDER BY sort, created_at`)
}
export function getPerson(db: DbLike, id: string) {
  return db.get<Person>(`SELECT * FROM person WHERE id = ?`, [id])
}
export async function savePerson(db: DbLike, p: Partial<Person> & { name: string }): Promise<string> {
  const t = now()
  const v = [p.name.trim(), clean(p.relation), p.birth_date || null, p.sex || null, clean(p.blood_type), clean(p.allergies), clean(p.conditions), clean(p.note), p.photo ?? null, p.color ?? null]
  if (p.id) {
    await db.run(
      `UPDATE person SET name=?, relation=?, birth_date=?, sex=?, blood_type=?, allergies=?, conditions=?, note=?, photo=?, color=?, active=?, updated_at=? WHERE id=?`,
      [...v, p.active ?? 1, t, p.id],
    )
    return p.id
  }
  const id = ulid()
  const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM person`)
  await db.run(
    `INSERT INTO person (name, relation, birth_date, sex, blood_type, allergies, conditions, note, photo, color, id, sort, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [...v, id, s?.s ?? 0, t, t],
  )
  return id
}
export async function deletePerson(db: DbLike, id: string) {
  await db.batch([
    { sql: `DELETE FROM dose WHERE medicine_id IN (SELECT id FROM medicine WHERE person_id = ?)`, bind: [id] },
    ...['medicine', 'reading', 'appointment', 'record'].map((tb) => ({ sql: `DELETE FROM ${tb} WHERE person_id = ?`, bind: [id] })),
    { sql: `DELETE FROM person WHERE id = ?`, bind: [id] },
  ])
}

// ── Readings ────────────────────────────────────────────────────────────────

export async function addReading(db: DbLike, r: { person_id: string; kind: Kind; v1: number; v2?: number | null; context?: string | null; taken_at?: number; note?: string | null }) {
  const t = now()
  const id = ulid()
  await db.run(`INSERT INTO reading (id, person_id, kind, v1, v2, context, taken_at, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    id, r.person_id, r.kind, r.v1, r.v2 ?? null, r.context ?? null, r.taken_at ?? t, clean(r.note), t, t,
  ])
  return id
}
export function deleteReading(db: DbLike, id: string) {
  return db.run(`DELETE FROM reading WHERE id = ?`, [id])
}
export function listReadings(db: DbLike, personId: string, kind: Kind, limit = 200) {
  return db.query<Reading>(`SELECT * FROM reading WHERE person_id = ? AND kind = ? ORDER BY taken_at DESC LIMIT ?`, [personId, kind, limit])
}
/** Latest reading of each kind for each person. */
export function latestReadings(db: DbLike) {
  return db.query<Reading>(
    `SELECT r.* FROM reading r JOIN (SELECT person_id, kind, MAX(taken_at) AS m FROM reading GROUP BY person_id, kind) x
       ON x.person_id = r.person_id AND x.kind = r.kind AND x.m = r.taken_at`,
  )
}

// ── Medicines & doses ───────────────────────────────────────────────────────

export function listMedicines(db: DbLike, personId?: string) {
  return personId
    ? db.query<Medicine>(`SELECT * FROM medicine WHERE person_id = ? ORDER BY active DESC, name`, [personId])
    : db.query<Medicine>(`SELECT * FROM medicine WHERE active = 1 ORDER BY name`)
}
export async function saveMedicine(db: DbLike, m: Partial<Medicine> & { person_id: string; name: string; times: string; start_date: string }) {
  const t = now()
  const v = [m.name.trim(), clean(m.dose), m.times, m.start_date, m.end_date || null, clean(m.note), m.active ?? 1]
  if (m.id) {
    await db.run(`UPDATE medicine SET name=?, dose=?, times=?, start_date=?, end_date=?, note=?, active=?, updated_at=? WHERE id=?`, [...v, t, m.id])
    return m.id
  }
  const id = ulid()
  await db.run(`INSERT INTO medicine (name, dose, times, start_date, end_date, note, active, id, person_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    ...v, id, m.person_id, t, t,
  ])
  return id
}
export function deleteMedicine(db: DbLike, id: string) {
  return db.batch([
    { sql: `DELETE FROM dose WHERE medicine_id = ?`, bind: [id] },
    { sql: `DELETE FROM medicine WHERE id = ?`, bind: [id] },
  ])
}
export async function takenOn(db: DbLike, date: string): Promise<Set<string>> {
  return new Set((await db.query<{ k: string }>(`SELECT medicine_id || '@' || time AS k FROM dose WHERE date = ?`, [date])).map((r) => r.k))
}
export async function setTaken(db: DbLike, medicineId: string, date: string, time: string, taken: boolean) {
  const t = now()
  if (!taken) return db.run(`DELETE FROM dose WHERE medicine_id = ? AND date = ? AND time = ?`, [medicineId, date, time])
  return db.run(`INSERT OR IGNORE INTO dose (id, medicine_id, date, time, taken_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, [ulid(), medicineId, date, time, t, t, t])
}

// ── Appointments ────────────────────────────────────────────────────────────

export function listAppointments(db: DbLike, personId?: string) {
  return personId
    ? db.query<Appointment>(`SELECT * FROM appointment WHERE person_id = ? ORDER BY done_at IS NOT NULL, date DESC, time`, [personId])
    : db.query<Appointment>(`SELECT * FROM appointment WHERE done_at IS NULL ORDER BY date, time`)
}
export async function saveAppointment(db: DbLike, a: Partial<Appointment> & { person_id: string; date: string }) {
  const t = now()
  const v = [a.date, a.time || null, clean(a.place), clean(a.doctor), clean(a.reason), clean(a.note)]
  if (a.id) {
    await db.run(`UPDATE appointment SET date=?, time=?, place=?, doctor=?, reason=?, note=?, updated_at=? WHERE id=?`, [...v, t, a.id])
    return a.id
  }
  const id = ulid()
  await db.run(`INSERT INTO appointment (date, time, place, doctor, reason, note, id, person_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [...v, id, a.person_id, t, t])
  return id
}
export function setAppointmentDone(db: DbLike, id: string, done: boolean) {
  const t = now()
  return db.run(`UPDATE appointment SET done_at = ?, updated_at = ? WHERE id = ?`, [done ? t : null, t, id])
}
export function deleteAppointment(db: DbLike, id: string) {
  return db.run(`DELETE FROM appointment WHERE id = ?`, [id])
}

// ── Records ─────────────────────────────────────────────────────────────────

export function listRecords(db: DbLike, personId: string) {
  return db.query<HealthRecord>(`SELECT * FROM record WHERE person_id = ? ORDER BY date DESC, created_at DESC`, [personId])
}
/** Records with a next-due date up to `until` (vaccines, check-ups). */
export function dueRecords(db: DbLike, until: string) {
  return db.query<HealthRecord>(`SELECT * FROM record WHERE next_due IS NOT NULL AND next_due <= ? ORDER BY next_due`, [until])
}
export async function saveRecord(db: DbLike, r: Partial<HealthRecord> & { person_id: string; kind: RecordKind; date: string; title: string }) {
  const t = now()
  const v = [r.kind, r.date, r.title.trim(), clean(r.note), r.photo ?? null, r.next_due || null]
  if (r.id) {
    await db.run(`UPDATE record SET kind=?, date=?, title=?, note=?, photo=?, next_due=?, updated_at=? WHERE id=?`, [...v, t, r.id])
    return r.id
  }
  const id = ulid()
  await db.run(`INSERT INTO record (kind, date, title, note, photo, next_due, id, person_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [...v, id, r.person_id, t, t])
  return id
}
/** Clear a next-due reminder (e.g. the follow-up was done). */
export function clearDue(db: DbLike, id: string) {
  return db.run(`UPDATE record SET next_due = NULL, updated_at = ? WHERE id = ?`, [now(), id])
}
export function deleteRecord(db: DbLike, id: string) {
  return db.run(`DELETE FROM record WHERE id = ?`, [id])
}

export async function referencedPhotos(db: DbLike): Promise<string[]> {
  return (await db.query<{ p: string }>(`SELECT photo AS p FROM record WHERE photo IS NOT NULL UNION SELECT photo FROM person WHERE photo IS NOT NULL`)).map((r) => r.p)
}

/** CSV of all readings (for the doctor or Excel). */
export async function readingsCsv(db: DbLike): Promise<string> {
  const rows = await db.query<Reading & { name: string }>(`SELECT r.*, p.name FROM reading r JOIN person p ON p.id = r.person_id ORDER BY p.sort, r.kind, r.taken_at`)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const iso = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const head = ['person', 'kind', 'value', 'value2', 'context', 'date_time', 'note']
  return '﻿' + [head.join(','), ...rows.map((r) => [r.name, r.kind, r.v1, r.v2, r.context, iso(r.taken_at), r.note].map(esc).join(','))].join('\r\n') + '\r\n'
}
