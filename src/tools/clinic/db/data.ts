/**
 * Clinic data access. Functions take the database first, so they run in the app and in Node
 * tests (scripts/test-clinic.mts). Every write bumps updated_at.
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests
import { encodeKx, type RxPayload } from '../../../core/exchange/codec.ts'
import { fingerprint, generateSigningKey, signCode, type SigningKey } from '../../../core/exchange/sign.ts'

export interface Patient {
  id: string
  code: string
  name: string
  sex: 'M' | 'F' | null
  birth_date: string | null
  phone: string | null
  address: string | null
  allergies: string | null
  conditions: string | null
  note: string | null
  created_at: number
}
export interface PatientRow extends Patient {
  visits: number
  last_date: string | null
  owing: number
}
export interface Service {
  id: string
  name: string
  kind: 'SERVICE' | 'MEDICINE'
  price: number
  unit: string | null
  active: number
  sort: number
}
export interface Visit {
  id: string
  patient_id: string
  date: string
  queue_no: number
  status: 'WAITING' | 'DONE'
  complaint: string | null
  bp_sys: number | null
  bp_dia: number | null
  pulse: number | null
  temp: number | null
  weight: number | null
  spo2: number | null
  glucose: number | null
  exam: string | null
  diagnosis: string | null
  plan: string | null
  followup_date: string | null
  discount: number
  paid: number
  pay_method: string | null
  rx_id: string | null
  done_at: number | null
  doctor_id: string | null
  room_id: string | null
  created_at: number
}
export interface VisitLine {
  id: string
  visit_id: string
  service_id: string | null
  name: string
  qty: number
  price: number
}
export interface RxItemRow {
  id: string
  visit_id: string
  name: string
  dose: string | null
  times: number | null
  days: number | null
  qty: number | null
  unit: string | null
  note: string | null
  sort: number
}
export interface VisitRow extends Visit {
  name: string
  code: string
  total: number
}

const now = () => Date.now()
const clean = (v: string | null | undefined) => (v ?? '').trim() || null

export async function getSettings(db: DbLike): Promise<Record<string, string>> {
  return Object.fromEntries((await db.query<{ key: string; value: string }>(`SELECT key, value FROM setting`)).map((r) => [r.key, r.value]))
}
export function setSetting(db: DbLike, key: string, value: string) {
  return db.run(`INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, now()])
}
export async function setupClinic(db: DbLike, name: string, currency: 'KHR' | 'USD') {
  const t = now()
  await db.batch(
    [
      ['book_id', ulid()],
      ['book_name', name],
      ['currency', currency],
      ['next_patient', '1'],
      ['round_step', currency === 'KHR' ? '100' : '1'],
    ].map(([k, v]) => ({ sql: `INSERT OR REPLACE INTO setting (key, value, updated_at) VALUES (?, ?, ?)`, bind: [k, v, t] })),
  )
}

// ── Patients ────────────────────────────────────────────────────────────────

/** Next free patient code, e.g. P-0001. */
async function nextCode(db: DbLike): Promise<string> {
  const s = await db.get<{ value: string }>(`SELECT value FROM setting WHERE key = 'next_patient'`)
  let n = Number(s?.value || 1)
  for (;;) {
    const code = `P-${String(n).padStart(4, '0')}`
    if (!(await db.get(`SELECT 1 FROM patient WHERE code = ?`, [code]))) {
      await setSetting(db, 'next_patient', String(n + 1))
      return code
    }
    n++
  }
}
export async function savePatient(db: DbLike, p: Partial<Patient> & { name: string }): Promise<string> {
  const t = now()
  const v = [p.name.trim(), p.sex || null, p.birth_date || null, clean(p.phone), clean(p.address), clean(p.allergies), clean(p.conditions), clean(p.note)]
  if (p.id) {
    await db.run(`UPDATE patient SET name=?, sex=?, birth_date=?, phone=?, address=?, allergies=?, conditions=?, note=?, updated_at=? WHERE id=?`, [...v, t, p.id])
    return p.id
  }
  const id = ulid()
  await db.run(`INSERT INTO patient (name, sex, birth_date, phone, address, allergies, conditions, note, id, code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    ...v, id, await nextCode(db), t, t,
  ])
  return id
}
export function getPatient(db: DbLike, id: string) {
  return db.get<Patient>(`SELECT * FROM patient WHERE id = ?`, [id])
}
/** Rounding step of the clinic's currency: 100 ៛ for riel, 1 cent for dollars (same as visitTotal). */
const STEP = `COALESCE((SELECT CAST(value AS INTEGER) FROM setting WHERE key = 'round_step'), 1)`
const TOTAL = `MAX(0, (SELECT COALESCE(SUM(ROUND(l.qty * l.price / ${STEP}) * ${STEP}), 0) FROM visit_line l WHERE l.visit_id = v.id) - v.discount)`
export async function listPatients(db: DbLike, search = ''): Promise<PatientRow[]> {
  const q = `%${search.trim()}%`
  return db.query<PatientRow>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM visit v WHERE v.patient_id = p.id) AS visits,
       (SELECT MAX(date) FROM visit v WHERE v.patient_id = p.id) AS last_date,
       (SELECT COALESCE(SUM(MAX(0, ${TOTAL} - v.paid)), 0) FROM visit v WHERE v.patient_id = p.id) AS owing
     FROM patient p
     WHERE ? = '%%' OR p.name LIKE ? OR p.code LIKE ? OR p.phone LIKE ?
     ORDER BY COALESCE((SELECT MAX(created_at) FROM visit v WHERE v.patient_id = p.id), p.created_at) DESC
     LIMIT 200`,
    [q, q, q, q],
  )
}
export async function deletePatient(db: DbLike, id: string) {
  await db.batch([
    { sql: `DELETE FROM visit_line WHERE visit_id IN (SELECT id FROM visit WHERE patient_id = ?)`, bind: [id] },
    { sql: `DELETE FROM rx_item WHERE visit_id IN (SELECT id FROM visit WHERE patient_id = ?)`, bind: [id] },
    { sql: `DELETE FROM visit WHERE patient_id = ?`, bind: [id] },
    { sql: `DELETE FROM appointment WHERE patient_id = ?`, bind: [id] },
    { sql: `DELETE FROM patient WHERE id = ?`, bind: [id] },
  ])
}

// ── Price list ──────────────────────────────────────────────────────────────

export function listServices(db: DbLike, all = false) {
  return db.query<Service>(`SELECT * FROM service ${all ? '' : 'WHERE active = 1'} ORDER BY kind, sort, name`)
}
export async function saveService(db: DbLike, s: Partial<Service> & { name: string; kind: Service['kind']; price: number }) {
  const t = now()
  if (s.id) {
    await db.run(`UPDATE service SET name=?, kind=?, price=?, unit=?, active=?, updated_at=? WHERE id=?`, [s.name.trim(), s.kind, s.price, clean(s.unit), s.active ?? 1, t, s.id])
    return s.id
  }
  const id = ulid()
  await db.run(`INSERT INTO service (id, name, kind, price, unit, active, sort, created_at, updated_at) VALUES (?,?,?,?,?,1,0,?,?)`, [id, s.name.trim(), s.kind, s.price, clean(s.unit), t, t])
  return id
}

// ── Visits ──────────────────────────────────────────────────────────────────

/** Start a visit: next queue number of the day, status WAITING. Adds the default consultation fee if set. */
export async function startVisit(
  db: DbLike, patientId: string, date: string, consultServiceId?: string | null, at: { doctor_id?: string | null; room_id?: string | null } = {},
): Promise<string> {
  const t = now()
  const id = ulid()
  const q = await db.get<{ n: number }>(`SELECT COALESCE(MAX(queue_no), 0) + 1 AS n FROM visit WHERE date = ?`, [date])
  await db.run(`INSERT INTO visit (id, patient_id, date, queue_no, status, discount, paid, doctor_id, room_id, created_at, updated_at) VALUES (?,?,?,?,'WAITING',0,0,?,?,?,?)`, [
    id, patientId, date, q?.n ?? 1, at.doctor_id ?? null, at.room_id ?? null, t, t,
  ])
  if (consultServiceId) {
    const s = await db.get<Service>(`SELECT * FROM service WHERE id = ?`, [consultServiceId])
    if (s) await addLine(db, id, { service_id: s.id, name: s.name, qty: 1, price: s.price })
  }
  return id
}
export function getVisit(db: DbLike, id: string) {
  return db.get<Visit>(`SELECT * FROM visit WHERE id = ?`, [id])
}
type VisitFields = Partial<Omit<Visit, 'id' | 'patient_id' | 'queue_no' | 'created_at'>>
const VISIT_COLS = ['date', 'status', 'complaint', 'bp_sys', 'bp_dia', 'pulse', 'temp', 'weight', 'spo2', 'glucose', 'exam', 'diagnosis', 'plan', 'followup_date', 'discount', 'paid', 'pay_method', 'rx_id', 'done_at', 'doctor_id', 'room_id'] as const
/** Save some fields of a visit (each field is saved as it is typed). */
export async function updateVisit(db: DbLike, id: string, f: VisitFields) {
  const cols = VISIT_COLS.filter((c) => c in f)
  if (!cols.length) return
  await db.run(`UPDATE visit SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => (f as any)[c] ?? null), now(), id])
}
export async function finishVisit(db: DbLike, id: string, done: boolean) {
  await updateVisit(db, id, { status: done ? 'DONE' : 'WAITING', done_at: done ? now() : null })
}
export async function deleteVisit(db: DbLike, id: string) {
  await db.batch([
    { sql: `UPDATE appointment SET status = 'BOOKED', visit_id = NULL, updated_at = ? WHERE visit_id = ?`, bind: [now(), id] },
    { sql: `DELETE FROM visit_line WHERE visit_id = ?`, bind: [id] },
    { sql: `DELETE FROM rx_item WHERE visit_id = ?`, bind: [id] },
    { sql: `DELETE FROM visit WHERE id = ?`, bind: [id] },
  ])
}
export function listVisitsOn(db: DbLike, date: string) {
  return db.query<VisitRow>(`SELECT v.*, p.name, p.code, ${TOTAL} AS total FROM visit v JOIN patient p ON p.id = v.patient_id WHERE v.date = ? ORDER BY v.queue_no`, [date])
}
export function listVisitsOf(db: DbLike, patientId: string) {
  return db.query<VisitRow>(`SELECT v.*, p.name, p.code, ${TOTAL} AS total FROM visit v JOIN patient p ON p.id = v.patient_id WHERE v.patient_id = ? ORDER BY v.date DESC, v.queue_no DESC`, [patientId])
}
/** Patients whose latest visit asked for a follow-up on or before `until`, who have not come back since and have no booking. */
export function followupsDue(db: DbLike, until: string) {
  return db.query<VisitRow>(
    `SELECT v.*, p.name, p.code, ${TOTAL} AS total FROM visit v JOIN patient p ON p.id = v.patient_id
     WHERE v.followup_date IS NOT NULL AND v.followup_date <= ?
       AND NOT EXISTS (SELECT 1 FROM visit v2 WHERE v2.patient_id = v.patient_id AND v2.date > v.date)
       AND NOT EXISTS (SELECT 1 FROM appointment a WHERE a.patient_id = v.patient_id AND a.date > v.date AND a.status IN ('BOOKED','ARRIVED'))
     ORDER BY v.followup_date`,
    [until],
  )
}

// fees
export function listLines(db: DbLike, visitId: string) {
  return db.query<VisitLine>(`SELECT * FROM visit_line WHERE visit_id = ? ORDER BY created_at`, [visitId])
}
export async function addLine(db: DbLike, visitId: string, l: { service_id?: string | null; name: string; qty: number; price: number }) {
  const t = now()
  await db.run(`INSERT INTO visit_line (id, visit_id, service_id, name, qty, price, created_at) VALUES (?,?,?,?,?,?,?)`, [ulid(), visitId, l.service_id ?? null, l.name.trim(), l.qty, l.price, t])
  await db.run(`UPDATE visit SET updated_at = ? WHERE id = ?`, [t, visitId])
}
export async function updateLine(db: DbLike, id: string, f: { qty?: number; price?: number }) {
  if (f.qty !== undefined) await db.run(`UPDATE visit_line SET qty = ? WHERE id = ?`, [f.qty, id])
  if (f.price !== undefined) await db.run(`UPDATE visit_line SET price = ? WHERE id = ?`, [f.price, id])
  await db.run(`UPDATE visit SET updated_at = ? WHERE id = (SELECT visit_id FROM visit_line WHERE id = ?)`, [now(), id])
}
export async function removeLine(db: DbLike, id: string) {
  await db.run(`UPDATE visit SET updated_at = ? WHERE id = (SELECT visit_id FROM visit_line WHERE id = ?)`, [now(), id])
  await db.run(`DELETE FROM visit_line WHERE id = ?`, [id])
}
/** Visit total in minor units: lines (rounded per line) minus discount. Riel lines round to 100 ៛. */
export function visitTotal(lines: { qty: number; price: number }[], discount: number, currency: 'KHR' | 'USD') {
  const step = currency === 'KHR' ? 100 : 1
  const sum = lines.reduce((s, l) => s + Math.round((l.qty * l.price) / step) * step, 0)
  return Math.max(0, sum - discount)
}

// prescription
export function listRx(db: DbLike, visitId: string) {
  return db.query<RxItemRow>(`SELECT * FROM rx_item WHERE visit_id = ? ORDER BY sort, created_at`, [visitId])
}
export async function saveRx(db: DbLike, visitId: string, r: Partial<RxItemRow> & { name: string }) {
  const t = now()
  const v = [r.name.trim(), clean(r.dose), r.times ?? null, r.days ?? null, r.qty ?? null, clean(r.unit), clean(r.note)]
  if (r.id) await db.run(`UPDATE rx_item SET name=?, dose=?, times=?, days=?, qty=?, unit=?, note=? WHERE id=?`, [...v, r.id])
  else {
    const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM rx_item WHERE visit_id = ?`, [visitId])
    await db.run(`INSERT INTO rx_item (name, dose, times, days, qty, unit, note, id, visit_id, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [...v, ulid(), visitId, s?.s ?? 0, t])
  }
  // a changed prescription gets a new id, so a pharmacy can tell versions apart
  await db.run(`UPDATE visit SET rx_id = NULL, updated_at = ? WHERE id = ?`, [t, visitId])
}
export async function removeRx(db: DbLike, id: string) {
  await db.run(`UPDATE visit SET rx_id = NULL, updated_at = ? WHERE id = (SELECT visit_id FROM rx_item WHERE id = ?)`, [now(), id])
  await db.run(`DELETE FROM rx_item WHERE id = ?`, [id])
}

/**
 * The prescription as a Kitroid code payload for a pharmacy: patient code, date, clinic, doctor
 * and medicines ONLY. Complaint, exam, diagnosis, plan and vitals are never included.
 */
export async function rxPayload(db: DbLike, visitId: string, opts: { includeName: boolean }): Promise<RxPayload | null> {
  const v = await getVisit(db, visitId)
  if (!v) return null
  const items = await listRx(db, visitId)
  if (!items.length) return null
  let rxId = v.rx_id
  if (!rxId) {
    rxId = ulid()
    await updateVisit(db, visitId, { rx_id: rxId })
  }
  const p = (await getPatient(db, v.patient_id))!
  const s = await getSettings(db)
  const doc = await visitDoctor(db, v)
  const age = p.birth_date ? Math.floor((Date.parse(v.date) - Date.parse(p.birth_date)) / 31_557_600_000) : undefined
  const out: RxPayload = {
    v: 1,
    id: rxId,
    code: p.code,
    date: v.date,
    clinic: s.book_name || 'Clinic',
    items: items.map((i) => {
      const it: RxPayload['items'][number] = { n: i.name }
      if (i.dose) it.d = i.dose
      if (i.times) it.t = i.times
      if (i.days) it.days = i.days
      if (i.qty) it.q = i.qty
      if (i.unit) it.u = i.unit
      if (i.note) it.note = i.note
      return it
    }),
  }
  if (doc.name) out.doctor = doc.name
  if (s.phone) out.phone = s.phone
  if (opts.includeName) out.name = p.name
  if (age !== undefined && age >= 0) out.age = age
  if (p.sex) out.sex = p.sex
  return out
}

/** Doctor printed on a visit's papers: the visit's doctor, else the clinic profile's doctor. */
export async function visitDoctor(db: DbLike, v: Pick<Visit, 'doctor_id'>): Promise<{ name: string; license: string }> {
  const d = v.doctor_id ? await db.get<Doctor>(`SELECT * FROM doctor WHERE id = ?`, [v.doctor_id]) : undefined
  if (d) return { name: d.name, license: d.license ?? '' }
  const s = await getSettings(db)
  return { name: s.doctor ?? '', license: s.license ?? '' }
}

// ── Doctors, rooms, appointments ────────────────────────────────────────────

export interface Doctor {
  id: string
  name: string
  title: string | null
  license: string | null
  phone: string | null
  color: string
  hours: string // JSON, see schedule.ts Hours
  slot_min: number
  room_id: string | null
  active: number
  sort: number
}
export interface Room {
  id: string
  name: string
  active: number
  sort: number
}
export type ApptStatus = 'BOOKED' | 'ARRIVED' | 'CANCELLED' | 'NO_SHOW'
export interface Appointment {
  id: string
  patient_id: string
  doctor_id: string | null
  room_id: string | null
  date: string
  start: string
  minutes: number
  reason: string | null
  note: string | null
  status: ApptStatus
  visit_id: string | null
  created_at: number
}
export interface ApptRow extends Appointment {
  name: string
  code: string
  phone: string | null
  visit_status: 'WAITING' | 'DONE' | null
  queue_no: number | null
}

export function listDoctors(db: DbLike, all = false) {
  return db.query<Doctor>(`SELECT * FROM doctor ${all ? '' : 'WHERE active = 1'} ORDER BY active DESC, sort, name`)
}
export async function saveDoctor(db: DbLike, d: Partial<Doctor> & { name: string; color: string }) {
  const t = now()
  const v = [d.name.trim(), clean(d.title), clean(d.license), clean(d.phone), d.color, d.hours ?? '{}', d.slot_min ?? 15, d.room_id || null, d.active ?? 1]
  if (d.id) {
    await db.run(`UPDATE doctor SET name=?, title=?, license=?, phone=?, color=?, hours=?, slot_min=?, room_id=?, active=?, updated_at=? WHERE id=?`, [...v, t, d.id])
    return d.id
  }
  const id = ulid()
  const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM doctor`)
  await db.run(`INSERT INTO doctor (name, title, license, phone, color, hours, slot_min, room_id, active, id, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...v, id, s?.s ?? 0, t, t])
  return id
}
export function listRooms(db: DbLike, all = false) {
  return db.query<Room>(`SELECT * FROM room ${all ? '' : 'WHERE active = 1'} ORDER BY active DESC, sort, name`)
}
export async function saveRoom(db: DbLike, r: Partial<Room> & { name: string }) {
  const t = now()
  if (r.id) {
    await db.run(`UPDATE room SET name=?, active=?, updated_at=? WHERE id=?`, [r.name.trim(), r.active ?? 1, t, r.id])
    return r.id
  }
  const id = ulid()
  const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM room`)
  await db.run(`INSERT INTO room (id, name, active, sort, created_at, updated_at) VALUES (?,?,1,?,?,?)`, [id, r.name.trim(), s?.s ?? 0, t, t])
  return id
}

const APPT = `SELECT a.*, p.name, p.code, p.phone, v.status AS visit_status, v.queue_no FROM appointment a JOIN patient p ON p.id = a.patient_id LEFT JOIN visit v ON v.id = a.visit_id`
/** Appointments from..to (inclusive), all statuses, by date and time. */
export function listAppointments(db: DbLike, from: string, to: string) {
  return db.query<ApptRow>(`${APPT} WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.start`, [from, to])
}
/** A patient's appointments from `from` on (booked or arrived). */
export function upcomingOf(db: DbLike, patientId: string, from: string) {
  return db.query<ApptRow>(`${APPT} WHERE a.patient_id = ? AND a.date >= ? AND a.status IN ('BOOKED','ARRIVED') ORDER BY a.date, a.start`, [patientId, from])
}
export function getAppointment(db: DbLike, id: string) {
  return db.get<ApptRow>(`${APPT} WHERE a.id = ?`, [id])
}
export type ApptFields = Pick<Appointment, 'patient_id' | 'date' | 'start' | 'minutes'> & Partial<Pick<Appointment, 'id' | 'doctor_id' | 'room_id' | 'reason' | 'note'>>
export async function saveAppointment(db: DbLike, a: ApptFields): Promise<string> {
  const t = now()
  const v = [a.patient_id, a.doctor_id || null, a.room_id || null, a.date, a.start, a.minutes, clean(a.reason), clean(a.note)]
  if (a.id) {
    await db.run(`UPDATE appointment SET patient_id=?, doctor_id=?, room_id=?, date=?, start=?, minutes=?, reason=?, note=?, updated_at=? WHERE id=?`, [...v, t, a.id])
    // a checked-in booking moves its visit to the new doctor/room too
    await db.run(`UPDATE visit SET doctor_id = ?, room_id = ?, updated_at = ? WHERE id = (SELECT visit_id FROM appointment WHERE id = ?)`, [a.doctor_id || null, a.room_id || null, t, a.id])
    return a.id
  }
  const id = ulid()
  await db.run(`INSERT INTO appointment (patient_id, doctor_id, room_id, date, start, minutes, reason, note, id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'BOOKED',?,?)`, [...v, id, t, t])
  return id
}
/** Cancelled / no-show / back to booked. A checked-in booking keeps its visit (delete the visit instead). */
export async function setAppointmentStatus(db: DbLike, id: string, status: Exclude<ApptStatus, 'ARRIVED'>) {
  await db.run(`UPDATE appointment SET status = ?, updated_at = ? WHERE id = ? AND visit_id IS NULL`, [status, now(), id])
}
export async function deleteAppointment(db: DbLike, id: string) {
  await db.run(`DELETE FROM appointment WHERE id = ?`, [id])
}
/**
 * The patient has arrived: put them in the queue of the booking's day with its doctor and room
 * (and the default fee). Checking in twice returns the same visit.
 */
export async function checkIn(db: DbLike, id: string, consultServiceId?: string | null): Promise<string | null> {
  const a = await db.get<Appointment>(`SELECT * FROM appointment WHERE id = ?`, [id])
  if (!a) return null
  if (a.visit_id && (await getVisit(db, a.visit_id))) return a.visit_id
  const vid = await startVisit(db, a.patient_id, a.date, consultServiceId, { doctor_id: a.doctor_id, room_id: a.room_id })
  if (a.reason) await updateVisit(db, vid, { complaint: a.reason })
  await db.run(`UPDATE appointment SET status = 'ARRIVED', visit_id = ?, updated_at = ? WHERE id = ?`, [vid, now(), id])
  return vid
}

// ── Signing (prescriptions and the clinic card) ─────────────────────────────

/**
 * The clinic's signing key. Made on first use and kept in the clinic database (so it is in the
 * clinic's own backups, encrypted if backup encryption is on). `rotate` makes a new key:
 * pharmacies then have to trust the clinic again.
 */
export async function clinicKey(db: DbLike, rotate = false): Promise<SigningKey & { fingerprint: string }> {
  const s = await getSettings(db)
  if (!rotate && s.sign_key && s.sign_pub) return { privateJwk: JSON.parse(s.sign_key), pub: s.sign_pub, fingerprint: await fingerprint(s.sign_pub) }
  const k = await generateSigningKey()
  await setSetting(db, 'sign_key', JSON.stringify(k.privateJwk))
  await setSetting(db, 'sign_pub', k.pub)
  return { ...k, fingerprint: await fingerprint(k.pub) }
}
/** Signed prescription code for a visit (null if it has no prescription). */
export async function signedRxCode(db: DbLike, visitId: string, opts: { includeName: boolean }): Promise<{ code: string; fingerprint: string } | null> {
  const pay = await rxPayload(db, visitId, opts)
  if (!pay) return null
  const k = await clinicKey(db)
  return { code: await signCode(encodeKx('rx', pay), k), fingerprint: k.fingerprint }
}
/** Signed clinic card: pharmacies scan it once (in person) to trust this clinic's prescriptions. */
export async function clinicCard(db: DbLike): Promise<{ code: string; fingerprint: string }> {
  const s = await getSettings(db)
  const k = await clinicKey(db)
  const card = { v: 1 as const, name: s.book_name || 'Clinic', ...(s.doctor ? { doctor: s.doctor } : {}), ...(s.phone ? { phone: s.phone } : {}), ...(s.address ? { address: s.address } : {}) }
  return { code: await signCode(encodeKx('ck', card), k), fingerprint: k.fingerprint }
}

// ── Reports & export ────────────────────────────────────────────────────────

export interface DayIncome {
  date: string
  visits: number
  billed: number
  received: number
}
export function incomeByDay(db: DbLike, from: string, to: string) {
  return db.query<DayIncome>(
    `SELECT v.date, COUNT(*) AS visits, COALESCE(SUM(${TOTAL}), 0) AS billed, COALESCE(SUM(v.paid), 0) AS received
     FROM visit v WHERE v.date BETWEEN ? AND ? GROUP BY v.date ORDER BY v.date`,
    [from, to],
  )
}

export interface DoctorIncome {
  doctor_id: string | null
  visits: number
  billed: number
  received: number
}
export function incomeByDoctor(db: DbLike, from: string, to: string) {
  return db.query<DoctorIncome>(
    `SELECT v.doctor_id, COUNT(*) AS visits, COALESCE(SUM(${TOTAL}), 0) AS billed, COALESCE(SUM(v.paid), 0) AS received
     FROM visit v WHERE v.date BETWEEN ? AND ? GROUP BY v.doctor_id ORDER BY billed DESC`,
    [from, to],
  )
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** Patients as CSV with the Customers (CRM) columns, so the file imports there directly. No medical details. */
export async function patientsCsv(db: DbLike): Promise<string> {
  const rows = await db.query<Patient>(`SELECT * FROM patient ORDER BY code`)
  const head = ['name', 'phone', 'telegram', 'address', 'tags', 'birthday', 'note']
  return '﻿' + [head.join(','), ...rows.map((p) => [p.name, p.phone, '', p.address, `Patient,${p.code}`, p.birth_date, ''].map(esc).join(','))].join('\r\n') + '\r\n'
}
/** Visits with fees for accounting (no complaint/diagnosis). */
export async function visitsCsv(db: DbLike, from: string, to: string, currency: 'KHR' | 'USD'): Promise<string> {
  const rows = await db.query<VisitRow & { doctor: string | null }>(
    `SELECT v.*, p.name, p.code, ${TOTAL} AS total, d.name AS doctor FROM visit v JOIN patient p ON p.id = v.patient_id LEFT JOIN doctor d ON d.id = v.doctor_id
     WHERE v.date BETWEEN ? AND ? ORDER BY v.date, v.queue_no`,
    [from, to],
  )
  const num = (v: number) => (currency === 'KHR' ? String(v) : (v / 100).toFixed(2))
  const head = ['date', 'queue', 'patient_code', 'patient', 'status', 'total', 'paid', 'owing', 'method', 'doctor']
  return '﻿' + [head.join(','), ...rows.map((r) => [r.date, r.queue_no, r.code, r.name, r.status, num(r.total), num(r.paid), num(Math.max(0, r.total - r.paid)), r.pay_method, r.doctor].map(esc).join(','))].join('\r\n') + '\r\n'
}
