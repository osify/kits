// Tong Tin (savings circle) tests.  node scripts/test-tongtin.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { TONGTIN_MIGRATIONS } from '../src/tools/tongtin/db/schema.ts'
import { saveCircle, getDetail, listCircles, saveRound, setPaid, payAll, deleteLastRound, deleteMember, saveMember, closeRound } from '../src/tools/tongtin/db/data.ts'
import { dues, potOf, summary, simulate, roundDate, liveBefore, sheet, sheetCsv } from '../src/tools/tongtin/rules.ts'
import type { DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()
const raw = new sqlite3.oo1.DB(':memory:', 'c')
raw.exec('PRAGMA foreign_keys = ON')
for (const m of TONGTIN_MIGRATIONS) raw.exec(m.sql)
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

// Dates
check('monthly date keeps the day', roundDate('2026-01-31', 'MONTH', 2) === '2026-02-28' && roundDate('2026-01-31', 'MONTH', 3) === '2026-03-31')
check('weekly date', roundDate('2026-11-16', 'WEEK', 3) === '2026-11-30')
check('half-month dates', roundDate('2026-11-01', 'HALF_MONTH', 2) === '2026-11-16' && roundDate('2026-11-01', 'HALF_MONTH', 3) === '2026-12-01')

// 5 hands × 100,000 ៛, bid mode, head takes round 1
const id = await saveCircle(db, { name: 'Market ladies', currency: 'KHR', amount: 100_000, start_date: '2026-11-01', every: 'MONTH', mode: 'BID', head_first: true }, ['Head', 'Sokha', 'Dara', 'Bopha', 'Vanna'])
let d = (await getDetail(db, id))!
const [head, sokha, dara, bopha, vanna] = d.members
check('5 hands, first name is the head', d.members.length === 5 && d.circle.head_id === head.id)

const r1 = dues(d.circle, d.members, d.rounds, 1, head.id, 30_000)
check('round 1: head takes 4 × 100,000 with no bid', potOf(r1) === 400_000 && !r1.has(head.id), [...r1])

await saveRound(db, { circle_id: id, no: 1, date: '2026-11-01', winner_id: head.id, bid: 0 })
d = (await getDetail(db, id))!
const r2 = dues(d.circle, d.members, d.rounds, 2, sokha.id, 20_000)
check('round 2: live hands pay 80,000, head (dead) pays 100,000', r2.get(head.id) === 100_000 && r2.get(dara.id) === 80_000 && potOf(r2) === 340_000, [...r2])
check('live before round 2 = 4 hands', liveBefore(d.members, d.rounds, 2).length === 4)

await saveRound(db, { circle_id: id, no: 2, date: '2026-12-01', winner_id: sokha.id, bid: 20_000 })
await setPaid(db, (await getDetail(db, id))!.rounds[1].id, dara.id, 80_000)
let rows = await listCircles(db)
check('list: round 2 is being collected (Dec 1), 7 shares unpaid', rows[0].drawn === 2 && rows[0].open_no === 2 && rows[0].next_date === '2026-12-01' && rows[0].unpaid === 7, rows[0])

await payAll(db, id, 2)
d = (await getDetail(db, id))!
check('pay all fills the rest of round 2', d.payments.filter((p) => p.round_no === 2).length === 4)

// Correct round 2's bid → paid amounts follow
await saveRound(db, { circle_id: id, no: 2, date: '2026-12-01', winner_id: sokha.id, bid: 10_000 })
d = (await getDetail(db, id))!
check('corrected bid updates paid shares to 90,000', d.payments.find((p) => p.round_no === 2 && p.member_id === dara.id)?.amount === 90_000)

await saveRound(db, { circle_id: id, no: 3, date: '2027-01-01', winner_id: dara.id, bid: 15_000 })
await saveRound(db, { circle_id: id, no: 4, date: '2027-02-01', winner_id: bopha.id, bid: 5_000 })
await saveRound(db, { circle_id: id, no: 5, date: '2027-03-01', winner_id: vanna.id, bid: 0 })
d = (await getDetail(db, id))!
const sum = summary(d.circle, d.members, d.rounds, d.payments)
const total = sum.reduce((s, r) => s + r.net, 0)
check('money in = money out (nets add to 0)', total === 0, sum)
const v = sum.find((s) => s.id === vanna.id)!
check('last hand pays 100k + 90k + 85k + 95k = 370,000, receives 400,000 (earns 30,000)', v.due === 370_000 && v.received === 400_000 && v.net === 30_000, v)
const h = sum.find((s) => s.id === head.id)!
check('head pays full every round (400,000) and takes 400,000', h.due === 400_000 && h.received === 400_000)
check('Dara paid round 2 only: owes 100k + 100k + 100k for rounds 1, 4, 5', sum.find((s) => s.id === dara.id)!.owing === 300_000, sum.find((s) => s.id === dara.id))

const sh = sheet(d.circle, d.members, d.rounds, d.payments)
check('sheet: 5 rows × 5 rounds', sh.rows.length === 5 && sh.rows.every((r) => r.cells.length === 5) && sh.rounds.length === 5)
check('sheet: the winner cell holds the pot', sh.rows[1].cells[1].kind === 'won' && (sh.rows[1].cells[1] as any).amount === 370_000, sh.rows[1].cells[1])
check('sheet: paid round 2 share for Dara = 90,000 paid', JSON.stringify(sh.rows[2].cells[1]) === JSON.stringify({ kind: 'pay', amount: 90_000, paid: true }))
check('sheet: round 2 fully collected', sh.rounds[1].collected === sh.rounds[1].pot)
const csv = sheetCsv(sh, 'KHR', { hand: 'Hand', round: 'Round', paid: 'Paid', owing: 'Owing', received: 'Received', net: 'Net', won: 'WON', unpaid: '(unpaid)', pot: 'Pot', bid: 'Bid' })
check('csv: header + 5 hands + bid + pot lines', csv.trim().split(String.fromCharCode(10)).length === 8 && csv.includes('WON 400000'), csv)

await deleteLastRound(db, id)
check('undo last round', (await getDetail(db, id))!.rounds.length === 4)
check('a hand with rounds cannot be removed', !(await deleteMember(db, sokha.id)))
const extra = await saveMember(db, { circle_id: id, name: 'Extra' })
check('a new hand can be removed', await deleteMember(db, extra))

// Bids per hand and closing rounds
const cid = await saveCircle(db, { name: 'Bids', currency: 'KHR', amount: 100_000, start_date: '2026-11-01', every: 'MONTH', mode: 'BID', head_first: true }, ['H', 'A', 'B', 'C'])
const b = (await getDetail(db, cid))!
await saveRound(db, { circle_id: cid, no: 1, date: '2026-11-01', winner_id: b.members[0].id, bid: 0 })
check('a recorded round is open until closed', (await listCircles(db)).find((r) => r.id === cid)?.open_no === 1)
await closeRound(db, (await getDetail(db, cid))!.rounds[0].id, true)
check('closing round 1 moves the circle to bidding for round 2', (await listCircles(db)).find((r) => r.id === cid)?.open_no === null)
// v2 migration: old rounds close, the newest stays open
{
  const old = new sqlite3.oo1.DB(':memory:', 'c')
  old.exec(TONGTIN_MIGRATIONS[0].sql)
  old.exec(`INSERT INTO circle VALUES ('c','x','KHR',100,'2026-01-01','MONTH','BID',1,NULL,NULL,NULL,1,1);
    INSERT INTO member (id,circle_id,name,sort,created_at,updated_at) VALUES ('m1','c','a',0,1,1),('m2','c','b',1,1,1);
    INSERT INTO round (id,circle_id,no,date,winner_id,bid,created_at,updated_at) VALUES ('r1','c',1,'2026-01-01','m1',0,5,5),('r2','c',2,'2026-02-01','m2',0,6,6);`)
  old.exec(TONGTIN_MIGRATIONS[1].sql)
  const rows = old.exec({ sql: 'SELECT no, closed_at FROM round ORDER BY no', rowMode: 'object', returnValue: 'resultRows' })
  check('migration v2: earlier rounds closed, newest open', rows[0].closed_at === 5 && rows[1].closed_at === null, rows)
}

// ORDER mode: no discount
const o = { amount: 50_000, start_date: '2026-01-01', every: 'MONTH' as const, mode: 'ORDER' as const, head_first: 0, head_id: null }
check('order mode ignores bids', potOf(dues(o, d.members, [], 1, head.id, 9_999)) === 200_000)

// Simulator
const sim = simulate(5, 100_000, [0, 20_000, 15_000, 10_000, 0], true)
check('simulate: nets add to 0', sim.reduce((s, r) => s + r.gain, 0) === 0, sim)
check('simulate: early hand pays a cost, last hand earns', (sim[1].ratePerRound ?? 0) < 0 && (sim[4].ratePerRound ?? 0) > 0, sim.map((s) => s.ratePerRound))
check('simulate: head with no bids breaks even', sim[0].gain === 0)
const ten = simulate(10, 100_000, [0, 20_000, 17_500, 15_000, 12_500, 10_000, 7_500, 5_000, 2_500, 0], true)
check('simulate: every turn gets a rate (no gaps)', ten.every((r) => r.ratePerRound !== null), ten.map((r) => r.ratePerRound))
check('simulate: rate sign follows cost / gain', ten.every((r) => Math.sign(r.ratePerRound ?? 0) === Math.sign(r.gain)), ten.map((r) => [r.gain, r.ratePerRound]))

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
