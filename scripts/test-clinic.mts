// Clinic tests.  node scripts/test-clinic.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { CLINIC_MIGRATIONS } from '../src/tools/clinic/db/schema.ts'
import {
  setupClinic, savePatient, listPatients, getPatient, saveService, startVisit, updateVisit, finishVisit, listVisitsOn, listLines, addLine,
  visitTotal, saveRx, listRx, rxPayload, followupsDue, incomeByDay, patientsCsv, visitsCsv, getVisit, setSetting, deletePatient,
} from '../src/tools/clinic/db/data.ts'
import { encodeKx, decodeKx } from '../src/core/exchange/codec.ts'
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

await deletePatient(db, a)
check('deleting a patient removes their visits', (await getVisit(db, v1)) === undefined && (await listVisitsOn(db, '2026-11-17')).length === 1)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
