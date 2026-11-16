// Tong Tin (savings circle) tests.  node scripts/test-tongtin.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { TONGTIN_MIGRATIONS } from '../src/tools/tongtin/db/schema.ts'
import { saveCircle, getDetail, listCircles, saveRound, setPaid, payAll, deleteLastRound, deleteMember, saveMember } from '../src/tools/tongtin/db/data.ts'
import { dues, potOf, summary, simulate, roundDate, liveBefore } from '../src/tools/tongtin/rules.ts'
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
check('list: 2 drawn, next date Jan 1, 7 shares unpaid', rows[0].drawn === 2 && rows[0].next_date === '2027-01-01' && rows[0].unpaid === 7, rows[0])

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

await deleteLastRound(db, id)
check('undo last round', (await getDetail(db, id))!.rounds.length === 4)
check('a hand with rounds cannot be removed', !(await deleteMember(db, sokha.id)))
const extra = await saveMember(db, { circle_id: id, name: 'Extra' })
check('a new hand can be removed', await deleteMember(db, extra))

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
