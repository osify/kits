/**
 * Tong Tin data access. Functions take the database first, so they run in the app and in
 * Node tests (scripts/test-tongtin.mts). Every write bumps updated_at.
 */
import type { DbLike } from '@/tools/pos/sync/engine'
import { ulid } from '../../../core/util/id.ts' // relative + extension: also runs in Node tests
import { dues, roundDate, type Every } from '../rules.ts'

export interface Circle {
  id: string
  name: string
  currency: 'KHR' | 'USD'
  amount: number
  start_date: string
  every: Every
  mode: 'BID' | 'ORDER'
  head_first: number
  head_id: string | null
  note: string | null
  closed_at: number | null
  created_at: number
  updated_at: number
}
export interface Member {
  id: string
  circle_id: string
  name: string
  phone: string | null
  note: string | null
  sort: number
}
export interface Round {
  id: string
  circle_id: string
  no: number
  date: string
  winner_id: string
  bid: number
  note: string | null
}
export interface Payment {
  id: string
  round_id: string
  round_no: number
  member_id: string
  amount: number
  paid_at: number
}
export interface CircleRow extends Circle {
  hands: number
  drawn: number // rounds drawn so far
  next_date: string | null
  unpaid: number // shares not yet paid in drawn rounds
}
export interface CircleDetail {
  circle: Circle
  members: Member[]
  rounds: Round[]
  payments: Payment[]
}

const now = () => Date.now()

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

export interface CircleInput {
  id?: string
  name: string
  currency: 'KHR' | 'USD'
  amount: number
  start_date: string
  every: Every
  mode: 'BID' | 'ORDER'
  head_first: boolean
  note?: string | null
}

/** Create a circle with its hands (first name = the head), or update its settings. */
export async function saveCircle(db: DbLike, c: CircleInput, memberNames: string[] = []): Promise<string> {
  const t = now()
  if (c.id) {
    await db.run(
      `UPDATE circle SET name=?, currency=?, amount=?, start_date=?, every=?, mode=?, head_first=?, note=?, updated_at=? WHERE id=?`,
      [c.name, c.currency, c.amount, c.start_date, c.every, c.mode, c.head_first ? 1 : 0, c.note ?? null, t, c.id],
    )
    return c.id
  }
  const id = ulid()
  const members = memberNames.map((n) => n.trim()).filter(Boolean).map((name, i) => ({ id: ulid(), name, sort: i }))
  await db.batch([
    {
      sql: `INSERT INTO circle (id, name, currency, amount, start_date, every, mode, head_first, head_id, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      bind: [id, c.name, c.currency, c.amount, c.start_date, c.every, c.mode, c.head_first ? 1 : 0, members[0]?.id ?? null, c.note ?? null, t, t],
    },
    ...members.map((m) => ({
      sql: `INSERT INTO member (id, circle_id, name, sort, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      bind: [m.id, id, m.name, m.sort, t, t],
    })),
  ])
  return id
}

export async function listCircles(db: DbLike): Promise<CircleRow[]> {
  const rows = await db.query<Circle & { hands: number; drawn: number; paid: number; shares: number }>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM member m WHERE m.circle_id = c.id) AS hands,
       (SELECT COUNT(*) FROM round r WHERE r.circle_id = c.id) AS drawn,
       (SELECT COUNT(*) FROM payment p JOIN round r ON r.id = p.round_id WHERE r.circle_id = c.id) AS paid
     FROM circle c ORDER BY c.closed_at IS NOT NULL, c.created_at DESC`,
  )
  return rows.map((r) => {
    const finished = r.drawn >= r.hands
    // every drawn round has (hands − 1) shares to pay
    const unpaid = Math.max(0, r.drawn * (r.hands - 1) - r.paid)
    return { ...r, next_date: finished || r.closed_at ? null : roundDate(r.start_date, r.every, r.drawn + 1), unpaid }
  })
}

export async function getDetail(db: DbLike, id: string): Promise<CircleDetail | null> {
  const circle = await db.get<Circle>(`SELECT * FROM circle WHERE id = ?`, [id])
  if (!circle) return null
  const [members, rounds, payments] = await Promise.all([
    db.query<Member>(`SELECT id, circle_id, name, phone, note, sort FROM member WHERE circle_id = ? ORDER BY sort, created_at`, [id]),
    db.query<Round>(`SELECT id, circle_id, no, date, winner_id, bid, note FROM round WHERE circle_id = ? ORDER BY no`, [id]),
    db.query<Payment>(
      `SELECT p.id, p.round_id, r.no AS round_no, p.member_id, p.amount, p.paid_at FROM payment p JOIN round r ON r.id = p.round_id WHERE r.circle_id = ?`,
      [id],
    ),
  ])
  return { circle, members, rounds, payments }
}

export async function setCircleClosed(db: DbLike, id: string, closed: boolean) {
  const t = now()
  await db.run(`UPDATE circle SET closed_at = ?, updated_at = ? WHERE id = ?`, [closed ? t : null, t, id])
}
export async function deleteCircle(db: DbLike, id: string) {
  await db.batch([
    { sql: `DELETE FROM payment WHERE round_id IN (SELECT id FROM round WHERE circle_id = ?)`, bind: [id] },
    { sql: `DELETE FROM round WHERE circle_id = ?`, bind: [id] },
    { sql: `DELETE FROM member WHERE circle_id = ?`, bind: [id] },
    { sql: `DELETE FROM circle WHERE id = ?`, bind: [id] },
  ])
}

// ── Members (hands) ─────────────────────────────────────────────────────────

export async function saveMember(db: DbLike, m: { id?: string; circle_id: string; name: string; phone?: string | null; note?: string | null }) {
  const t = now()
  if (m.id) {
    await db.run(`UPDATE member SET name=?, phone=?, note=?, updated_at=? WHERE id=?`, [m.name.trim(), m.phone || null, m.note || null, t, m.id])
    return m.id
  }
  const id = ulid()
  const s = await db.get<{ s: number }>(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM member WHERE circle_id = ?`, [m.circle_id])
  await db.run(`INSERT INTO member (id, circle_id, name, phone, note, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`, [
    id, m.circle_id, m.name.trim(), m.phone || null, m.note || null, s?.s ?? 0, t, t,
  ])
  await touch(db, m.circle_id)
  return id
}

/** A hand can be removed only while it has no rounds or payments. */
export async function deleteMember(db: DbLike, id: string): Promise<boolean> {
  const used = await db.get<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM round WHERE winner_id = ?) + (SELECT COUNT(*) FROM payment WHERE member_id = ?) AS n`,
    [id, id],
  )
  if (used && used.n > 0) return false
  const m = await db.get<{ circle_id: string }>(`SELECT circle_id FROM member WHERE id = ?`, [id])
  await db.run(`DELETE FROM member WHERE id = ?`, [id])
  if (m) {
    await db.run(`UPDATE circle SET head_id = NULL WHERE id = ? AND head_id = ?`, [m.circle_id, id])
    await touch(db, m.circle_id)
  }
  return true
}

/** Save the order of hands (ORDER mode takes the pot in this order). */
export async function reorderMembers(db: DbLike, circleId: string, ids: string[]) {
  const t = now()
  await db.batch(ids.map((id, i) => ({ sql: `UPDATE member SET sort = ?, updated_at = ? WHERE id = ? AND circle_id = ?`, bind: [i, t, id, circleId] })))
  await touch(db, circleId)
}

export async function setHead(db: DbLike, circleId: string, memberId: string | null) {
  await db.run(`UPDATE circle SET head_id = ?, updated_at = ? WHERE id = ?`, [memberId, now(), circleId])
}

const touch = (db: DbLike, circleId: string) => db.run(`UPDATE circle SET updated_at = ? WHERE id = ?`, [now(), circleId])

// ── Rounds & payments ───────────────────────────────────────────────────────

/** Record (or correct) a drawn round. Corrections keep payments that are still valid. */
export async function saveRound(db: DbLike, r: { circle_id: string; no: number; date: string; winner_id: string; bid: number; note?: string | null }) {
  const t = now()
  const old = await db.get<{ id: string }>(`SELECT id FROM round WHERE circle_id = ? AND no = ?`, [r.circle_id, r.no])
  if (old) {
    await db.batch([
      { sql: `UPDATE round SET date=?, winner_id=?, bid=?, note=?, updated_at=? WHERE id=?`, bind: [r.date, r.winner_id, r.bid, r.note ?? null, t, old.id] },
      // the new winner does not pay this round
      { sql: `DELETE FROM payment WHERE round_id = ? AND member_id = ?`, bind: [old.id, r.winner_id] },
    ])
    await refreshPaymentAmounts(db, r.circle_id, r.no)
    await touch(db, r.circle_id)
    return old.id
  }
  const id = ulid()
  await db.run(`INSERT INTO round (id, circle_id, no, date, winner_id, bid, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
    id, r.circle_id, r.no, r.date, r.winner_id, r.bid, r.note ?? null, t, t,
  ])
  await touch(db, r.circle_id)
  return id
}

/** Only the last round can be undone (later rounds depend on who already took the pot). */
export async function deleteLastRound(db: DbLike, circleId: string) {
  const last = await db.get<{ id: string }>(`SELECT id FROM round WHERE circle_id = ? ORDER BY no DESC LIMIT 1`, [circleId])
  if (!last) return
  await db.batch([
    { sql: `DELETE FROM payment WHERE round_id = ?`, bind: [last.id] },
    { sql: `DELETE FROM round WHERE id = ?`, bind: [last.id] },
  ])
  await touch(db, circleId)
}

/** Mark a hand's share for a round as paid (amount = its due) or unpaid. */
export async function setPaid(db: DbLike, roundId: string, memberId: string, amount: number | null) {
  const t = now()
  if (amount === null) {
    await db.run(`DELETE FROM payment WHERE round_id = ? AND member_id = ?`, [roundId, memberId])
  } else {
    await db.run(
      `INSERT INTO payment (id, round_id, member_id, amount, paid_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (round_id, member_id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
      [ulid(), roundId, memberId, amount, t, t, t],
    )
  }
  await db.run(`UPDATE round SET updated_at = ? WHERE id = ?`, [t, roundId])
}

/** Mark every unpaid share of a round as paid. */
export async function payAll(db: DbLike, circleId: string, no: number) {
  const d = await getDetail(db, circleId)
  const r = d?.rounds.find((x) => x.no === no)
  if (!d || !r) return
  const owed = dues(d.circle, d.members, d.rounds, no, r.winner_id, r.bid)
  const paid = new Set(d.payments.filter((p) => p.round_id === r.id).map((p) => p.member_id))
  for (const [m, v] of owed) if (!paid.has(m)) await setPaid(db, r.id, m, v)
}

/** After a correction, paid shares follow the new dues (e.g. a changed bid). */
async function refreshPaymentAmounts(db: DbLike, circleId: string, fromNo: number) {
  const d = await getDetail(db, circleId)
  if (!d) return
  const t = now()
  const stmts: { sql: string; bind: (string | number)[] }[] = []
  for (const r of d.rounds.filter((x) => x.no >= fromNo)) {
    const owed = dues(d.circle, d.members, d.rounds, r.no, r.winner_id, r.bid)
    for (const p of d.payments.filter((x) => x.round_id === r.id)) {
      const v = owed.get(p.member_id)
      if (v === undefined) stmts.push({ sql: `DELETE FROM payment WHERE id = ?`, bind: [p.id] })
      else if (v !== p.amount) stmts.push({ sql: `UPDATE payment SET amount = ?, updated_at = ? WHERE id = ?`, bind: [v, t, p.id] })
    }
  }
  if (stmts.length) await db.batch(stmts)
}

export async function referencedPhotos(): Promise<string[]> {
  return []
}
