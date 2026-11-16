/**
 * Multi-device sync engine (no network code here; see ./index.ts for Google Drive).
 *
 * - Triggers (migration v4) record every changed ENTITY in `_dirty` on the device where it changed.
 * - collectChanges() turns `_dirty` into ops: the entity's current row (+ child rows), or a
 *   tombstone if it no longer exists. POS carts / parked tickets (POS sales in DRAFT) never leave
 *   their device.
 * - applyChanges() applies another device's ops: last write wins by the entity's marker column
 *   (updated_at, or closed_at / created_at). Ties keep the local copy, so applying the same file
 *   twice changes nothing. While applying, `_sync_state.applying = '1'` stops the triggers so
 *   applied changes are not sent back out.
 */
import type { Stmt } from '@/core/db/protocol'

export interface DbLike {
  query<T = Record<string, unknown>>(sql: string, bind?: any[]): Promise<T[]>
  get<T = Record<string, unknown>>(sql: string, bind?: any[]): Promise<T | undefined>
  run(sql: string, bind?: any[]): Promise<number>
  batch(stmts: Stmt[]): Promise<number>
}

type Row = Record<string, unknown>

export interface SyncOp {
  e: string
  id: string
  at: number
  del?: true
  row?: Row
  kids?: Record<string, Row[]>
}

export interface ChangeFile {
  v: 1
  app: 'kitroid-pos'
  schema: number
  device: string
  created_at: number
  ops: SyncOp[]
}

interface Entity {
  table: string
  key: string
  marker: string
  children?: { table: string; fk: string }[]
  /** extra cleanup when the entity is deleted (foreign keys are off while applying) */
  onDelete?: string[]
}

/** Order matters: parents before children when inserting, reversed when deleting. */
export const ENTITIES: Record<string, Entity> = {
  shop: { table: 'shop', key: 'id', marker: 'updated_at' },
  setting: { table: 'setting', key: 'key', marker: 'updated_at' },
  category: { table: 'category', key: 'id', marker: 'updated_at', onDelete: [`UPDATE item SET category_id = NULL WHERE category_id = ?`] },
  modgroup: {
    table: 'modifier_group',
    key: 'id',
    marker: 'updated_at',
    children: [{ table: 'modifier_option', fk: 'group_id' }],
    onDelete: [`DELETE FROM item_modifier_group WHERE group_id = ?`],
  },
  item: {
    table: 'item',
    key: 'id',
    marker: 'updated_at',
    children: [{ table: 'item_modifier_group', fk: 'item_id' }],
    onDelete: [`DELETE FROM stock_move WHERE item_id = ?`, `UPDATE sale_line SET item_id = NULL WHERE item_id = ?`],
  },
  customer: { table: 'customer', key: 'id', marker: 'updated_at' },
  sale: {
    table: 'sale',
    key: 'id',
    marker: 'updated_at',
    children: [
      { table: 'sale_line', fk: 'sale_id' },
      { table: 'payment', fk: 'sale_id' },
    ],
  },
  ledger: { table: 'customer_ledger', key: 'id', marker: 'created_at' },
  stock: { table: 'stock_move', key: 'id', marker: 'created_at' },
  dayclose: { table: 'day_close', key: 'business_date', marker: 'closed_at' },
}
const ORDER = Object.keys(ENTITIES)

export interface DirtyRow {
  entity: string
  id: string
  at: number
}

/** Mark every existing entity as changed (first sync of a device sends everything). */
export async function markAllDirty(db: DbLike) {
  const now = Date.now()
  await db.batch(
    ORDER.map((e) => ({
      sql: `INSERT OR REPLACE INTO _dirty (entity, id, at) SELECT ?, ${ENTITIES[e].key}, ? FROM ${ENTITIES[e].table}`,
      bind: [e, now],
    })),
  )
}

export async function pendingCount(db: DbLike): Promise<number> {
  return (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM _dirty`))?.n ?? 0
}

/** Build the ops to upload. Returns the dirty rows read, to acknowledge after a successful upload. */
export async function collectChanges(db: DbLike): Promise<{ ops: SyncOp[]; dirty: DirtyRow[] }> {
  const dirty = await db.query<DirtyRow>(`SELECT entity, id, at FROM _dirty ORDER BY at`)
  const ops: SyncOp[] = []
  for (const d of dirty) {
    const ent = ENTITIES[d.entity]
    if (!ent) continue
    const row = await db.get<Row>(`SELECT * FROM ${ent.table} WHERE ${ent.key} = ?`, [d.id])
    if (!row) {
      ops.push({ e: d.entity, id: d.id, at: d.at, del: true })
      continue
    }
    // A POS cart / parked ticket stays on its own device.
    if (d.entity === 'sale' && row.kind === 'POS' && row.status === 'DRAFT') continue
    const kids: Record<string, Row[]> = {}
    for (const c of ent.children ?? []) kids[c.table] = await db.query<Row>(`SELECT * FROM ${c.table} WHERE ${c.fk} = ?`, [d.id])
    ops.push({ e: d.entity, id: d.id, at: d.at, row, kids })
  }
  return { ops, dirty }
}

/** Forget uploaded changes (unless the entity changed again since it was read). */
export async function ackChanges(db: DbLike, dirty: DirtyRow[]) {
  if (!dirty.length) return
  await db.batch(dirty.map((d) => ({ sql: `DELETE FROM _dirty WHERE entity = ? AND id = ? AND at <= ?`, bind: [d.entity, d.id, d.at] })))
}

const colCache = new Map<string, Set<string>>()
async function columns(db: DbLike, table: string): Promise<Set<string>> {
  let c = colCache.get(table)
  if (!c) {
    c = new Set((await db.query<{ name: string }>(`PRAGMA table_info(${table})`)).map((r) => r.name))
    colCache.set(table, c)
  }
  return c
}
/** For tests / after a migration. */
export function resetColumnCache() {
  colCache.clear()
}

async function insertStmt(db: DbLike, table: string, row: Row): Promise<Stmt> {
  // Drop columns this device's schema doesn't have (other device may run a newer app).
  const cols = [...(await columns(db, table))].filter((c) => c in row)
  return { sql: `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, bind: cols.map((c) => row[c] as any) }
}

/** Apply another device's change file. Returns how many ops changed this database. */
export async function applyChanges(db: DbLike, file: ChangeFile): Promise<number> {
  const rank = (e: string) => ORDER.indexOf(e)
  const ups = file.ops.filter((o) => !o.del && ENTITIES[o.e]).sort((a, b) => rank(a.e) - rank(b.e))
  const dels = file.ops.filter((o) => o.del && ENTITIES[o.e]).sort((a, b) => rank(b.e) - rank(a.e))
  const stmts: Stmt[] = []
  let applied = 0

  for (const op of [...ups, ...dels]) {
    const ent = ENTITIES[op.e]
    const local = await db.get<{ m: number | null }>(`SELECT ${ent.marker} AS m FROM ${ent.table} WHERE ${ent.key} = ?`, [op.id])
    if (op.del) {
      if (!local) continue
      if ((local.m ?? 0) > op.at) continue // edited here after it was deleted there
      for (const c of ent.children ?? []) stmts.push({ sql: `DELETE FROM ${c.table} WHERE ${c.fk} = ?`, bind: [op.id] })
      for (const sql of ent.onDelete ?? []) stmts.push({ sql, bind: [op.id] })
      stmts.push({ sql: `DELETE FROM ${ent.table} WHERE ${ent.key} = ?`, bind: [op.id] })
      applied++
      continue
    }
    const incoming = Number(op.row?.[ent.marker] ?? 0)
    if (local && (local.m ?? 0) >= incoming) continue // local copy is the same or newer
    for (const c of ent.children ?? []) stmts.push({ sql: `DELETE FROM ${c.table} WHERE ${c.fk} = ?`, bind: [op.id] })
    stmts.push(await insertStmt(db, ent.table, op.row!))
    for (const c of ent.children ?? []) for (const kid of op.kids?.[c.table] ?? []) stmts.push(await insertStmt(db, c.table, kid))
    applied++
  }
  if (!stmts.length) return 0

  // Foreign keys off: rows can arrive before what they point to (or after it was deleted).
  await db.run(`PRAGMA foreign_keys = OFF`)
  try {
    await db.batch([
      { sql: `UPDATE _sync_state SET value = '1' WHERE key = 'applying'` },
      ...stmts,
      { sql: `UPDATE _sync_state SET value = '0' WHERE key = 'applying'` },
    ])
  } finally {
    await db.run(`PRAGMA foreign_keys = ON`)
  }
  return applied
}
