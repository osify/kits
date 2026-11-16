/**
 * Tong Tin (savings circle) rules: pure functions, tested by scripts/test-tongtin.mts.
 *
 * Each round every hand pays `amount`, and one hand takes the pot.
 * - BID mode (ដេញ): hands that have not taken the pot yet ("live") bid a discount; the highest
 *   bid wins. Live hands then pay `amount − bid`; hands that already took the pot ("dead") pay
 *   the full `amount`. The winner does not pay in the round they win.
 * - ORDER mode: no bids, the pot goes round by round in the agreed order.
 * - head_first: the organiser (head, មេតុង) takes round 1 with no bid, then pays full like any dead hand.
 */

export type Every = 'MONTH' | 'HALF_MONTH' | 'WEEK' | 'DAY'
export interface CircleLike {
  amount: number
  start_date: string
  every: Every
  mode: 'BID' | 'ORDER'
  head_first: number
  head_id: string | null
}
export interface MemberLike {
  id: string
  name: string
}
export interface RoundLike {
  no: number
  winner_id: string
  bid: number
  date?: string
}
export interface PaymentLike {
  round_no: number
  member_id: string
  amount: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Date of round `no` (1-based). Months keep the day (clamped to the month's last day). */
export function roundDate(start: string, every: Every, no: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const k = no - 1
  if (every === 'DAY' || every === 'WEEK') return iso(new Date(y, m - 1, d + k * (every === 'WEEK' ? 7 : 1)))
  if (every === 'HALF_MONTH') {
    // 1st & 16th style: every second round is 15 days after the month step
    const base = new Date(y, m - 1 + Math.floor(k / 2), 1)
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    return iso(new Date(base.getFullYear(), base.getMonth(), Math.min(last, d + (k % 2) * 15)))
  }
  const base = new Date(y, m - 1 + k, 1)
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return iso(new Date(base.getFullYear(), base.getMonth(), Math.min(d, last)))
}

/** Hands that have not taken the pot before round `no`. */
export function liveBefore(members: MemberLike[], rounds: RoundLike[], no: number): MemberLike[] {
  const won = new Set(rounds.filter((r) => r.no < no).map((r) => r.winner_id))
  return members.filter((m) => !won.has(m.id))
}

/** What each hand pays in a round won by `winnerId` with `bid`. Winner is not listed. */
export function dues(c: CircleLike, members: MemberLike[], rounds: RoundLike[], no: number, winnerId: string, bid: number): Map<string, number> {
  const won = new Set(rounds.filter((r) => r.no < no).map((r) => r.winner_id))
  const b = c.mode === 'BID' && !(no === 1 && c.head_first) ? Math.max(0, Math.min(bid, c.amount)) : 0
  const out = new Map<string, number>()
  for (const m of members) {
    if (m.id === winnerId) continue
    out.set(m.id, won.has(m.id) ? c.amount : c.amount - b)
  }
  return out
}

export const potOf = (d: Map<string, number>) => [...d.values()].reduce((s, v) => s + v, 0)

export interface MemberSummary {
  id: string
  name: string
  wonRound: number | null
  received: number // pot taken
  due: number // what they should have paid in rounds so far
  paid: number // what was marked paid
  owing: number // due − paid
  net: number // received − due (what the circle has given them so far)
}

/** Per-hand totals for all rounds drawn so far. */
export function summary(c: CircleLike, members: MemberLike[], rounds: RoundLike[], payments: PaymentLike[]): MemberSummary[] {
  const rows = new Map<string, MemberSummary>(members.map((m) => [m.id, { id: m.id, name: m.name, wonRound: null, received: 0, due: 0, paid: 0, owing: 0, net: 0 }]))
  for (const r of [...rounds].sort((a, b) => a.no - b.no)) {
    const d = dues(c, members, rounds, r.no, r.winner_id, r.bid)
    const w = rows.get(r.winner_id)
    if (w) {
      w.wonRound = r.no
      w.received += potOf(d)
    }
    for (const [id, v] of d) {
      const s = rows.get(id)
      if (s) s.due += v
    }
  }
  for (const p of payments) {
    const s = rows.get(p.member_id)
    if (s) s.paid += p.amount
  }
  for (const s of rows.values()) {
    s.owing = s.due - s.paid
    s.net = s.received - s.due
  }
  return [...rows.values()]
}

/** Rate per round that makes the flows balance, searched outward from 0 (finds the root nearest 0). */
export function rateNearZero(flows: number[]): number {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0)
  const bisect = (a: number, b: number) => {
    for (let i = 0; i < 100; i++) {
      const mid = (a + b) / 2
      if (npv(a) * npv(mid) <= 0) b = mid
      else a = mid
    }
    return (a + b) / 2
  }
  const step = 0.0005
  for (let k = 0; k < 1000; k++) {
    const up = k * step
    if (npv(up) === 0) return up
    if (npv(up) * npv(up + step) < 0) return bisect(up, up + step)
    const dn = -k * step
    if (npv(dn - step) * npv(dn) < 0) return bisect(dn - step, dn)
  }
  return NaN
}

export interface SimRow {
  position: number // round in which this hand takes the pot
  bid: number
  receives: number
  pays: number // total paid over the whole circle
  gain: number // receives − pays
  ratePerRound: number | null // % per round: >0 = earned (saver), <0 = cost (borrower)
}

/**
 * Plan a whole circle: `hands` hands, `amount` each round, `bids[i]` = expected bid in round i+1
 * (missing = 0). Shows what the hand that takes round k receives, pays and gains, and the
 * implied interest rate per round.
 */
export function simulate(hands: number, amount: number, bids: number[], headFirst: boolean, mode: 'BID' | 'ORDER' = 'BID'): SimRow[] {
  const n = Math.max(2, Math.floor(hands))
  const members = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: String(i + 1) }))
  const c: CircleLike = { amount, start_date: '2000-01-01', every: 'MONTH', mode, head_first: headFirst ? 1 : 0, head_id: '1' }
  const rounds: RoundLike[] = members.map((m, i) => ({ no: i + 1, winner_id: m.id, bid: bids[i] ?? 0 }))
  return members.map((m, i) => {
    const flows: number[] = []
    let receives = 0
    let pays = 0
    for (const r of rounds) {
      const d = dues(c, members, rounds, r.no, r.winner_id, r.bid)
      if (r.winner_id === m.id) {
        receives = potOf(d)
        flows.push(receives)
      } else {
        const v = d.get(m.id) ?? 0
        pays += v
        flows.push(-v)
      }
    }
    // Rate per round that makes the hand's cash flows balance; + = earned (saver), − = cost (borrower).
    const gain = receives - pays
    const r = gain === 0 ? 0 : rateNearZero(flows)
    const rate = Number.isFinite(r) ? Math.sign(gain) * Math.abs(r) * 100 : null
    return { position: i + 1, bid: rounds[i].bid, receives, pays, gain, ratePerRound: rate }
  })
}
