import { db, dbState } from './index'
import { ulid } from '@/core/util/id'
import { today } from '@/core/util/date'

/**
 * Stock is a ledger, never a stored counter:
 *   on hand = SUM(stock moves) − quantity sold
 * "Sold" = lines of POS sales that are PAID/CLOSED and Quick Sales tallies (any status but VOID,
 * including today's open tally, since those items have physically left). Voiding a sale therefore
 * puts its items back automatically. Free/give-away lines also reduce stock.
 */
export type MoveKind = 'RECEIVE' | 'ADJUST' | 'WASTE'

export interface StockRow {
  item_id: string
  name: string
  name_km: string | null
  icon: string | null
  image_path: string | null
  category_id: string | null
  low_stock: number | null
  moved: number
  sold: number
  on_hand: number
}

export interface StockMove {
  id: string
  item_id: string
  kind: MoveKind
  qty: number
  unit_cost: number | null
  note: string | null
  business_date: string
  created_at: number
}

const SOLD = `(SELECT COALESCE(SUM(l.qty), 0) FROM sale_line l JOIN sale s ON s.id = l.sale_id
   WHERE l.item_id = i.id AND (s.status IN ('PAID','SUBMITTED','CLOSED') OR (s.kind = 'QUICK' AND s.status = 'DRAFT')))`
const MOVED = `(SELECT COALESCE(SUM(m.qty), 0) FROM stock_move m WHERE m.item_id = i.id)`

export function stockList(): Promise<StockRow[]> {
  return db.query<StockRow>(
    `SELECT i.id AS item_id, i.name, i.name_km, i.icon, i.image_path, i.category_id, i.low_stock,
            ${MOVED} AS moved, ${SOLD} AS sold, ${MOVED} - ${SOLD} AS on_hand
     FROM item i LEFT JOIN category c ON c.id = i.category_id
     WHERE i.track_stock = 1 AND i.active = 1
     ORDER BY COALESCE(c.sort, 9999), i.sort, i.name`,
  )
}

/** item_id → on hand, for tracked items only (used by the sell screens). */
export async function stockMap(): Promise<Map<string, number>> {
  const rows = await db.query<{ id: string; on_hand: number }>(
    `SELECT i.id, ${MOVED} - ${SOLD} AS on_hand FROM item i WHERE i.track_stock = 1`,
  )
  return new Map(rows.map((r) => [r.id, r.on_hand]))
}

export function stockMoves(itemId: string, limit = 50): Promise<StockMove[]> {
  return db.query<StockMove>(`SELECT * FROM stock_move WHERE item_id = ? ORDER BY created_at DESC LIMIT ?`, [itemId, limit])
}

/** Receive (+), waste (−) or a stock count (ADJUST: `qty` = the counted quantity). */
export async function addMove(itemId: string, kind: MoveKind, qty: number, opts: { unitCost?: number | null; note?: string } = {}) {
  let delta = qty
  if (kind === 'WASTE') delta = -Math.abs(qty)
  if (kind === 'ADJUST') {
    const cur = (await db.get<{ on_hand: number }>(`SELECT ${MOVED} - ${SOLD} AS on_hand FROM item i WHERE i.id = ?`, [itemId]))?.on_hand ?? 0
    delta = qty - cur
    if (delta === 0) return
  }
  await db.run(
    `INSERT INTO stock_move (id, item_id, kind, qty, unit_cost, note, business_date, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ulid(), itemId, kind, delta, opts.unitCost ?? null, opts.note || null, today(), dbState.deviceId, Date.now()],
  )
}
