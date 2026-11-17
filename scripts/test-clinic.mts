// Clinic tests.  node scripts/test-clinic.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { CLINIC_MIGRATIONS } from '../src/tools/clinic/db/schema.ts'
import {
  setupClinic, savePatient, listPatients, getPatient, saveService, startVisit, updateVisit, finishVisit, listVisitsOn, listLines, addLine,
  visitTotal, saveRx, listRx, rxPayload, signedRxCode, clinicCard, clinicKey, followupsDue, incomeByDay, patientsCsv, visitsCsv, getVisit, setSetting, deletePatient,
  saveRoom, saveDoctor, listDoctors, listRooms, saveAppointment, listAppointments, upcomingOf, checkIn, getAppointment, deleteVisit, setAppointmentStatus,
  visitDoctor, incomeByDoctor,
} from '../src/tools/clinic/db/data.ts'
import {
  addDays, clashes, dayWindow, freeSlots, lanes, normalizeHours, overlaps, weekday, weekStart, withinHours, type Hours, type Slot,
} from '../src/tools/clinic/schedule.ts'
import { encodeKx, decodeKx } from '../src/core/exchange/codec.ts'
import { verifyCode } from '../src/core/exchange/sign.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of CLINIC_MIGRATIONS) raw.exec(m.sql)
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

await setupClinic(db, 'Clinic Sok', 'KHR')
await setSetting(db, 'doctor', 'Dr Sok Dara')
const a = await savePatient(db, { name: 'Chan Thy', sex: 'F', birth_date: '1990-05-10', phone: '012 333 444', allergies: 'Penicillin' })
const b = await savePatient(db, { name: 'Kim Leng', sex: 'M' })
check('patient codes P-0001, P-0002', (await getPatient(db, a))!.code === 'P-0001' && (await getPatient(db, b))!.code === 'P-0002')
check('search by code / phone / name', (await listPatients(db, 'P-0002'))[0]?.id === b && (await listPatients(db, '333'))[0]?.id === a && (await listPatients(db, 'chan')).length === 1)

const consult = await saveService(db, { name: 'Consultation', kind: 'SERVICE', price: 20_000 })
await saveService(db, { name: 'Amoxicillin 500 mg', kind: 'MEDICINE', price: 500, unit: 'capsule' })
const v1 = await startVisit(db, a, '2026-11-17', consult)
const v2 = await startVisit(db, b, '2026-11-17')
check('queue numbers 1, 2 for the day', (await listVisitsOn(db, '2026-11-17')).map((v) => v.queue_no).join() === '1,2')
check('default consultation fee added', (await listLines(db, v1)).length === 1)

await updateVisit(db, v1, { complaint: 'Cough 5 days', bp_sys: 128, bp_dia: 82, temp: 37.9, diagnosis: 'Acute bronchitis', plan: 'Rest, fluids', followup_date: '2026-11-24' })
await addLine(db, v1, { name: 'Amoxicillin 500 mg', qty: 15, price: 500 })
const lines = await listLines(db, v1)
check('total in riel: 20,000 + 15 × 500 = 27,500', visitTotal(lines, 0, 'KHR') === 27_500)
check('discount reduces the total, never below 0', visitTotal(lines, 2_500, 'KHR') === 25_000 && visitTotal(lines, 99_999, 'KHR') === 0)
check('riel lines round to 100 ៛', visitTotal([{ qty: 3, price: 333 }], 0, 'KHR') === 1_000)
await addLine(db, v2, { name: 'Odd price', qty: 3, price: 333 })
check('list total uses the same 100 ៛ rounding', (await listVisitsOn(db, '2026-11-17')).find((r) => r.id === v2)!.total === 1_000)
check('USD cents stay exact', visitTotal([{ qty: 3, price: 333 }], 0, 'USD') === 999)
await updateVisit(db, v1, { paid: 20_000, pay_method: 'CASH' })
await finishVisit(db, v1, true)
const rows = await listVisitsOn(db, '2026-11-17')
check('visit total and status in the list', rows[0].total === 27_500 && rows[0].status === 'DONE')
check('patient owes 7,500', (await listPatients(db, 'Chan'))[0].owing === 7_500)

// Prescription → pharmacy code
await saveRx(db, v1, { name: 'Amoxicillin 500 mg', dose: '1 capsule', times: 3, days: 5, qty: 15, unit: 'capsule', note: 'after food' })
await saveRx(db, v1, { name: 'Paracetamol 500 mg', dose: '1 tablet', times: 3, days: 3 })
check('2 prescription lines', (await listRx(db, v1)).length === 2)
const pay = (await rxPayload(db, v1, { includeName: false }))!
const code = encodeKx('rx', pay)
const json = JSON.stringify(decodeKx(code).data)
check('pharmacy code has patient code, clinic, doctor, medicines', pay.code === 'P-0001' && pay.clinic === 'Clinic Sok' && pay.doctor === 'Dr Sok Dara' && pay.items.length === 2)
check('pharmacy code has NO complaint, diagnosis, plan, vitals or allergy text', !/bronchitis|cough|rest|128|37\.9|penicillin/i.test(json), json)
check('patient name left out unless chosen', !json.includes('Chan Thy') && (await rxPayload(db, v1, { includeName: true }))!.name === 'Chan Thy')
check('age and sex are included for dosing', pay.age === 36 && pay.sex === 'F')
const id1 = pay.id
check('same prescription keeps its id', (await rxPayload(db, v1, { includeName: false }))!.id === id1)
await saveRx(db, v1, { name: 'Vitamin C', times: 1, days: 10 })
check('changing the prescription gives a new id', (await rxPayload(db, v1, { includeName: false }))!.id !== id1)

// Signed prescription + clinic card
const sc = (await signedRxCode(db, v1, { includeName: false }))!
const ver = await verifyCode(sc.code)
check('prescription code is signed by the clinic key', ver.status === 'signed' && (ver as any).fingerprint === sc.fingerprint)
check('the key is kept: same fingerprint next time', (await signedRxCode(db, v1, { includeName: false }))!.fingerprint === sc.fingerprint)
const card = await clinicCard(db)
check('clinic card is signed with the same key and carries the clinic name', card.fingerprint === sc.fingerprint && decodeKx(card.code).type === 'ck' && (decodeKx(card.code).data as any).name === 'Clinic Sok')
const rotated = await clinicKey(db, true)
check('a new key gives a new fingerprint', rotated.fingerprint !== sc.fingerprint && (await signedRxCode(db, v1, { includeName: false }))!.fingerprint === rotated.fingerprint)

// Follow-ups, reports, CSV
check('follow-up due on 24 Nov shows from that day', (await followupsDue(db, '2026-11-24')).length === 1 && (await followupsDue(db, '2026-11-23')).length === 0)
await startVisit(db, a, '2026-11-24')
check('follow-up disappears once the patient comes back', (await followupsDue(db, '2026-11-30')).length === 0)
const inc = await incomeByDay(db, '2026-11-01', '2026-11-30')
check('income by day: 17 Nov 2 visits, billed 27,500, received 20,000', inc[0].visits === 2 && inc[0].billed === 28_500 && inc[0].received === 20_000, inc)
const pcsv = await patientsCsv(db)
check('patients CSV uses the Customers columns and no medical data', pcsv.includes('name,phone,telegram,address,tags,birthday,note') && pcsv.includes('"Patient,P-0001"') && !/penicillin/i.test(pcsv), pcsv)
const vcsv = await visitsCsv(db, '2026-11-01', '2026-11-30', 'KHR')
check('visits CSV has fees, not the diagnosis', vcsv.includes('27500') && !/bronchitis/i.test(vcsv))

// ── Schedule rules ──────────────────────────────────────────────────────────
const H = { '1': [['08:00', '12:00'], ['14:00', '17:00']], '3': [['08:00', '12:00']] } as Hours
check('weekday of 2026-11-16 is Monday (timezone-proof)', weekday('2026-11-16') === 1 && weekStart('2026-11-19') === '2026-11-16' && addDays('2026-11-30', 1) === '2026-12-01')
check('within hours: 09:00 30 min on Monday', withinHours(H, '2026-11-16', '09:00', 30))
check('not within: 11:45 30 min runs past 12:00', !withinHours(H, '2026-11-16', '11:45', 30))
check('not within: lunch 12:30', !withinHours(H, '2026-11-16', '12:30', 15))
check('no hours set = any time is fine', withinHours({}, '2026-11-15', '22:00', 30))
check('overlap: 09:00+30 vs 09:15+15', overlaps({ date: 'd', start: '09:00', minutes: 30 }, { date: 'd', start: '09:15', minutes: 15 }))
check('back-to-back is not an overlap', !overlaps({ date: 'd', start: '09:00', minutes: 30 }, { date: 'd', start: '09:30', minutes: 15 }))
const others = [
  { id: 'x', date: '2026-11-16', start: '09:00', minutes: 30, doctor_id: 'D1', room_id: 'R1', patient_id: 'P9', status: 'BOOKED' },
  { id: 'y', date: '2026-11-16', start: '10:00', minutes: 30, doctor_id: 'D2', room_id: 'R1', patient_id: 'P8', status: 'BOOKED' },
  { id: 'z', date: '2026-11-16', start: '11:00', minutes: 30, doctor_id: 'D1', room_id: 'R1', patient_id: 'P7', status: 'CANCELLED' },
]
const kinds = (s: Partial<Slot>) => clashes({ date: '2026-11-16', start: '09:00', minutes: 15, ...s } as Slot, others, H).map((c) => c.kind).join()
check('same doctor at the same time clashes', kinds({ doctor_id: 'D1' }) === 'doctor')
check('another doctor in the same room clashes on the room', kinds({ doctor_id: 'D3', room_id: 'R1', start: '10:15' }) === 'room')
check('same patient twice clashes', kinds({ doctor_id: 'D3', patient_id: 'P9' }) === 'patient')
check('cancelled bookings do not clash', kinds({ doctor_id: 'D1', start: '11:00' }) === '')
check('editing a booking does not clash with itself', kinds({ id: 'x', doctor_id: 'D1' }) === '')
check('outside hours / day off are flagged', kinds({ start: '12:30' }) === 'hours' && clashes({ date: '2026-11-17', start: '09:00', minutes: 15 }, [], H)[0]?.kind === 'dayOff')
const free = freeSlots(H, '2026-11-16', 30, others.filter((o) => o.doctor_id === 'D1'), 30)
check('free slots skip the booked 09:00 and lunch', free[0] === '08:00' && free[1] === '08:30' && free[2] === '09:30' && !free.includes('12:00') && free.includes('14:00') && free.at(-1) === '16:30', free)
check('free slots skip times already past', freeSlots(H, '2026-11-16', 30, [], 30, 15 * 60)[0] === '15:00')
check('calendar window covers hours and late bookings', dayWindow([H], ['2026-11-16'], [{ date: '2026-11-16', start: '18:30', minutes: 30 }]).join() === '480,1140')
const ln = lanes([{ start: '09:00', minutes: 30 }, { start: '09:15', minutes: 30 }, { start: '10:00', minutes: 15 }])
check('overlapping blocks get side-by-side lanes', ln[0].of === 2 && ln[1].lane === 1 && ln[2].of === 1 && ln[2].lane === 0, ln)
check('hours are cleaned and sorted', JSON.stringify(normalizeHours({ '2': [['14:00', '17:00'], ['08:00', '12:00'], ['13:00', '12:00']] } as Hours)) === '{"2":[["08:00","12:00"],["14:00","17:00"]]}')

// ── Doctors, rooms, appointments ────────────────────────────────────────────
const r1 = await saveRoom(db, { name: 'Room 1' })
const d1 = await saveDoctor(db, { name: 'Dr Chea Sophal', title: 'Pediatrics', license: 'MD-77', color: '#2563eb', hours: JSON.stringify(H), slot_min: 20, room_id: r1 })
const d2 = await saveDoctor(db, { name: 'Dr Ly Nary', color: '#db2777' })
check('doctors and rooms saved', (await listDoctors(db)).length === 2 && (await listRooms(db))[0].name === 'Room 1')
await saveDoctor(db, { id: d2, name: 'Dr Ly Nary', color: '#db2777', active: 0 })
check('inactive doctors are hidden unless asked', (await listDoctors(db)).length === 1 && (await listDoctors(db, true)).length === 2)

const ap1 = await saveAppointment(db, { patient_id: b, doctor_id: d1, room_id: r1, date: '2026-11-30', start: '09:00', minutes: 20, reason: 'Fever check' })
const ap2 = await saveAppointment(db, { patient_id: a, doctor_id: d1, date: '2026-11-30', start: '09:20', minutes: 20 })
const day30 = await listAppointments(db, '2026-11-30', '2026-11-30')
check('appointments listed by time with patient', day30.length === 2 && day30[0].id === ap1 && day30[0].code === 'P-0002' && day30[0].status === 'BOOKED')
check('patient upcoming bookings', (await upcomingOf(db, b, '2026-11-17')).length === 1)

const vq = await checkIn(db, ap1, consult)
const vis = (await getVisit(db, vq!))!
check('check-in puts the patient in the queue with doctor, room, reason and fee', vis.doctor_id === d1 && vis.room_id === r1 && vis.complaint === 'Fever check' && vis.status === 'WAITING' && (await listLines(db, vq!)).length === 1)
check('checking in twice gives the same visit', (await checkIn(db, ap1, consult)) === vq)
check('booking shows arrived + visit status', (await getAppointment(db, ap1))!.status === 'ARRIVED' && (await getAppointment(db, ap1))!.visit_status === 'WAITING')
await saveAppointment(db, { id: ap1, patient_id: b, doctor_id: d2, room_id: null, date: '2026-11-30', start: '09:00', minutes: 20 })
check('moving a checked-in booking moves its visit to the new doctor', (await getVisit(db, vq!))!.doctor_id === d2)
await deleteVisit(db, vq!)
check('deleting the visit frees the booking again', (await getAppointment(db, ap1))!.status === 'BOOKED' && (await getAppointment(db, ap1))!.visit_id === null)
await setAppointmentStatus(db, ap2, 'NO_SHOW')
check('no-show is kept for the record', (await getAppointment(db, ap2))!.status === 'NO_SHOW')

// prescription shows the visit's doctor
await updateVisit(db, v1, { doctor_id: d1 })
const pd = (await rxPayload(db, v1, { includeName: false }))!
check('prescription carries the visit doctor, not the profile doctor', pd.doctor === 'Dr Chea Sophal' && (await visitDoctor(db, { doctor_id: null })).name === 'Dr Sok Dara')
const byDoc = await incomeByDoctor(db, '2026-11-01', '2026-11-30')
check('income by doctor', byDoc.find((x) => x.doctor_id === d1)?.billed === 27_500 && byDoc.some((x) => x.doctor_id === null), byDoc)
check('visits CSV has the doctor column', (await visitsCsv(db, '2026-11-17', '2026-11-17', 'KHR')).includes('Dr Chea Sophal'))

// follow-up hidden once a booking exists
const v3 = await startVisit(db, b, '2026-12-01')
await updateVisit(db, v3, { followup_date: '2026-12-05' })
check('follow-up due without a booking', (await followupsDue(db, '2026-12-06')).some((x) => x.id === v3))
await saveAppointment(db, { patient_id: b, doctor_id: d1, date: '2026-12-07', start: '08:00', minutes: 20 })
check('follow-up leaves the list once booked', !(await followupsDue(db, '2026-12-06')).some((x) => x.id === v3))

await deletePatient(db, a)
check('deleting a patient removes their visits', (await getVisit(db, v1)) === undefined && (await listVisitsOn(db, '2026-11-17')).length === 1)
check('…and their appointments', (await getAppointment(db, ap2)) === undefined)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
