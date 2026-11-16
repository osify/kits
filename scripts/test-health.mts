// Personal & family health tests.  node scripts/test-health.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { HEALTH_MIGRATIONS } from '../src/tools/health/db/schema.ts'
import {
  savePerson, listPeople, addReading, listReadings, latestReadings, saveMedicine, listMedicines, setTaken, takenOn,
  saveAppointment, listAppointments, setAppointmentDone, saveRecord, dueRecords, deletePerson, readingsCsv,
} from '../src/tools/health/db/data.ts'
import { bpLevel, glucoseLevel, tempLevel, bmi, bmiLevel, age, dosesOn, timesOf, mmolToMgdl, mgdlToMmol } from '../src/tools/health/rules.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of HEALTH_MIGRATIONS) raw.exec(m.sql)
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

// Rules
check('BP 118/76 normal, 125/78 elevated, 135/85 high, 185/100 very high, 85/55 low',
  bpLevel(118, 76) === 'normal' && bpLevel(125, 78) === 'elevated' && bpLevel(135, 85) === 'high' && bpLevel(185, 100) === 'veryHigh' && bpLevel(85, 55) === 'low')
check('glucose fasting 110 elevated, after meal 110 normal, 65 low', glucoseLevel(110, 'FASTING') === 'elevated' && glucoseLevel(110, 'AFTER_MEAL') === 'normal' && glucoseLevel(65, 'RANDOM') === 'low')
check('temperature 38.2 °C = high (fever)', tempLevel(38.2) === 'high' && tempLevel(36.8) === 'normal')
check('BMI 70 kg / 170 cm = 24.2 (elevated, Asian cut-off)', bmi(70, 170) === 24.2 && bmiLevel(24.2) === 'elevated')
check('mmol/L ↔ mg/dL', mmolToMgdl(5.5) === 99 && mgdlToMmol(126) === 7)
check('age: born 2020-11-20 is 5 on 2026-11-17 (birthday not yet)', age('2020-11-20', '2026-11-17')?.years === 5 && age('2020-11-17', '2026-11-17')?.years === 6)
check('times are cleaned and sorted', JSON.stringify(timesOf('20:00, 8:00,bad')) === '["08:00","20:00"]')

// People & readings
const me = await savePerson(db, { name: 'Dara', relation: 'me', birth_date: '1985-03-02', sex: 'M', blood_type: 'O+' })
const kid = await savePerson(db, { name: 'Sophea', relation: 'daughter', birth_date: '2019-06-01', sex: 'F', allergies: 'Penicillin' })
check('2 people', (await listPeople(db)).length === 2)
await addReading(db, { person_id: me, kind: 'BP', v1: 135, v2: 85, taken_at: 1_000 })
await addReading(db, { person_id: me, kind: 'BP', v1: 128, v2: 79, taken_at: 2_000 })
await addReading(db, { person_id: me, kind: 'WEIGHT', v1: 72.5, taken_at: 1_500 })
const bps = await listReadings(db, me, 'BP')
check('readings newest first', bps.length === 2 && bps[0].v1 === 128)
const latest = await latestReadings(db)
check('latest per kind: BP 128/79 and weight 72.5', latest.length === 2 && latest.some((r) => r.kind === 'BP' && r.v1 === 128) && latest.some((r) => r.kind === 'WEIGHT'))

// Medicines
const amlo = await saveMedicine(db, { person_id: me, name: 'Amlodipine', dose: '5 mg', times: '08:00', start_date: '2026-11-01' })
await saveMedicine(db, { person_id: kid, name: 'Paracetamol syrup', dose: '5 ml', times: '20:00,08:00,14:00', start_date: '2026-11-15', end_date: '2026-11-17' })
const meds = await listMedicines(db)
check('doses on 2026-11-17: 08:00 ×2, 14:00, 20:00', JSON.stringify(dosesOn(meds, '2026-11-17').map((d) => d.time)) === '["08:00","08:00","14:00","20:00"]')
check('course ended: only Amlodipine on 2026-11-18', dosesOn(meds, '2026-11-18').length === 1)
check('not started yet on 2026-10-31', dosesOn(meds, '2026-10-31').length === 0)
await setTaken(db, amlo, '2026-11-17', '08:00', true)
await setTaken(db, amlo, '2026-11-17', '08:00', true) // twice = once
check('taken mark is kept once', (await takenOn(db, '2026-11-17')).has(`${amlo}@08:00`) && (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM dose'))!.n === 1)
await setTaken(db, amlo, '2026-11-17', '08:00', false)
check('untick removes the mark', (await takenOn(db, '2026-11-17')).size === 0)

// Appointments & records
const ap = await saveAppointment(db, { person_id: kid, date: '2026-11-20', time: '09:30', place: 'Calmette', reason: 'Check-up' })
check('open appointments listed', (await listAppointments(db)).length === 1)
await setAppointmentDone(db, ap, true)
check('done appointment leaves the open list', (await listAppointments(db)).length === 0)
await saveRecord(db, { person_id: kid, kind: 'VACCINE', date: '2026-06-01', title: 'MMR dose 1', next_due: '2026-12-01' })
check('due vaccine shows in the next 30 days', (await dueRecords(db, '2026-12-17')).length === 1 && (await dueRecords(db, '2026-11-30')).length === 0)

const csv = await readingsCsv(db)
check('CSV has header + 3 readings', csv.trim().split(String.fromCharCode(10)).length === 4, csv)

await deletePerson(db, kid)
check('deleting a person removes their data', (await listMedicines(db)).length === 1 && (await dueRecords(db, '2030-01-01')).length === 0)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
