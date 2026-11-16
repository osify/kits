// Sync engine test: two devices (in-memory SQLite, real migrations + triggers).
//   node scripts/test-sync.mts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { POS_MIGRATIONS } from '../src/tools/pos/db/schema.ts'
import { applyChanges, collectChanges, ackChanges, markAllDirty, pendingCount, resetColumnCache, type ChangeFile, type DbLike } from '../src/tools/pos/sync/engine.ts'

const sqlite3: any = await sqlite3InitModule()

function device(name: string): DbLike & { raw: any; name: string } {
  const raw = new sqlite3.oo1.DB(':memory:', 'c')
  raw.exec('PRAGMA foreign_keys = ON')
  for (const m of POS_MIGRATIONS) raw.exec(m.sql)
  return {
    raw,
    name,
    async query(sql, bind) {
      return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
    },
    async get(sql, bind) {
      return raw.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })[0]
    },
    async run(sql, bind) {
      raw.exec({ sql, bind })
      return raw.changes()
    },
    async batch(stmts) {
      let n = 0
      raw.transaction(() => {
        for (const s of stmts) {
          raw.exec({ sql: s.sql, bind: s.bind })
          n += raw.changes()
        }
      })
      return n
    },
  }
}

let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function ship(from: ReturnType<typeof device>, to: ReturnType<typeof device>) {
  const { ops, dirty } = await collectChanges(from)
  const file: ChangeFile = { v: 1, app: 'kitroid-pos', schema: POS_MIGRATIONS.length, device: from.name, created_at: Date.now(), ops }
  await ackChanges(from, dirty)
  const n = await applyChanges(to, JSON.parse(JSON.stringify(file)))
  return { file, n }
}
const one = async (d: DbLike, sql: string, bind: unknown[] = []) => (await d.get<any>(sql, bind)) ?? null

resetColumnCache()
const A = device('A')
const B = device('B')
let t = 1_000

// ── A: initial shop data ─────────────────────────────────────────────
await A.run(`INSERT INTO shop (id, name, base_currency, khr_per_usd, created_at, updated_at) VALUES ('shop1', 'LomOr', 'KHR', 4100, ?, ?)`, [t, t])
await A.run(`INSERT INTO category (id, name, sort, active, created_at, updated_at) VALUES ('cat1', 'Coffee', 1, 1, ?, ?)`, [t, t])
await A.run(`INSERT INTO item (id, category_id, name, price, sort, active, created_at, updated_at) VALUES ('it1', 'cat1', 'Latte', 5000, 1, 1, ?, ?)`, [t, t])
await A.run(`INSERT INTO modifier_group (id, name, min_select, max_select, sort, created_at, updated_at) VALUES ('mg1', 'Size', 0, 1, 1, ?, ?)`, [t, t])
await A.run(`INSERT INTO modifier_option (id, group_id, name, price_delta, sort) VALUES ('mo1', 'mg1', 'Large', 1000, 0)`)
await A.run(`INSERT INTO item_modifier_group (item_id, group_id, sort) VALUES ('it1', 'mg1', 0)`)
await A.run(`INSERT INTO customer (id, name, active, created_at, updated_at) VALUES ('c1', 'Sokha', 1, ?, ?)`, [t, t])
await A.run(`INSERT INTO sale (id, kind, number, business_date, status, currency, khr_per_usd, subtotal, total, device_id, customer_id, created_at, updated_at)
             VALUES ('s1', 'POS', '261116-A-001', '2026-11-16', 'PAID', 'KHR', 4100, 10000, 10000, 'A', 'c1', ?, ?)`, [t, t])
await A.run(`INSERT INTO sale_line (id, sale_id, item_id, name, qty, unit_price, line_total, sort) VALUES ('l1', 's1', 'it1', 'Latte', 2, 5000, 10000, 1)`)
await A.run(`INSERT INTO payment (id, sale_id, method, currency, amount, created_at) VALUES ('p1', 's1', 'DEBT', 'KHR', 10000, ?)`, [t])
await A.run(`INSERT INTO customer_ledger (id, customer_id, kind, sale_id, currency, khr_per_usd, amount, business_date, device_id, created_at) VALUES ('g1', 'c1', 'CHARGE', 's1', 'KHR', 4100, 10000, '2026-11-16', 'A', ?)`, [t])
await A.run(`INSERT INTO stock_move (id, item_id, kind, qty, business_date, device_id, created_at) VALUES ('m1', 'it1', 'RECEIVE', 20, '2026-11-16', 'A', ?)`, [t])
// a POS cart that must NOT leave device A
await A.run(`INSERT INTO sale (id, kind, business_date, status, currency, khr_per_usd, device_id, created_at, updated_at) VALUES ('cart', 'POS', '2026-11-16', 'DRAFT', 'KHR', 4100, 'A', ?, ?)`, [t, t])

check('triggers recorded changes on A', (await pendingCount(A)) > 0, await pendingCount(A))
let r = await ship(A, B)
check('first sync applied all 8 entities on B', r.n === 8, r.n)
check('POS cart not shipped', !r.file.ops.some((o) => o.id === 'cart'))
check('A has nothing pending after ack', (await pendingCount(A)) === 0)
check('B recorded no echo changes', (await pendingCount(B)) === 0, await pendingCount(B))
check('B has the sale with line + payment', (await one(B, `SELECT COUNT(*) n FROM sale_line WHERE sale_id='s1'`)).n === 1 && (await one(B, `SELECT COUNT(*) n FROM payment WHERE sale_id='s1'`)).n === 1)
check('B has item add-on link + option', (await one(B, `SELECT COUNT(*) n FROM item_modifier_group`)).n === 1 && (await one(B, `SELECT COUNT(*) n FROM modifier_option`)).n === 1)
check('B has ledger + stock move', (await one(B, `SELECT COUNT(*) n FROM customer_ledger`)).n === 1 && (await one(B, `SELECT COUNT(*) n FROM stock_move`)).n === 1)
check('applying flag reset on B', (await one(B, `SELECT value FROM _sync_state WHERE key='applying'`)).value === '0')
check('same file again changes nothing', (await applyChanges(B, r.file)) === 0)

// ── concurrent edit: last write wins ─────────────────────────────────
await A.run(`UPDATE item SET price = 5500, updated_at = ? WHERE id = 'it1'`, [2_000])
await B.run(`UPDATE item SET price = 6000, updated_at = ? WHERE id = 'it1'`, [3_000])
await ship(A, B)
await ship(B, A)
check('newer edit wins on both devices', (await one(A, `SELECT price FROM item WHERE id='it1'`)).price === 6000 && (await one(B, `SELECT price FROM item WHERE id='it1'`)).price === 6000)

// ── B sells on its own (Quick Sales tally, edited after first sync) ─
await B.run(`INSERT INTO sale (id, kind, number, business_date, status, currency, khr_per_usd, subtotal, total, device_id, created_at, updated_at) VALUES ('q1', 'QUICK', 'Q261116-B', '2026-11-16', 'DRAFT', 'KHR', 4100, 5000, 5000, 'B', ?, ?)`, [4_000, 4_000])
await B.run(`INSERT INTO sale_line (id, sale_id, item_id, name, qty, unit_price, line_total, sort) VALUES ('ql1', 'q1', 'it1', 'Latte', 1, 5000, 5000, 1)`)
await ship(B, A)
await B.run(`UPDATE sale_line SET qty = 3, line_total = 15000 WHERE id = 'ql1'`)
await B.run(`UPDATE sale SET subtotal = 15000, total = 15000, updated_at = ? WHERE id = 'q1'`, [5_000])
await ship(B, A)
check('tally line edits replace children on A', (await one(A, `SELECT qty FROM sale_line WHERE id='ql1'`)).qty === 3 && (await one(A, `SELECT total FROM sale WHERE id='q1'`)).total === 15000)
check('both devices see the same day total', (await one(A, `SELECT SUM(total) s FROM sale WHERE status <> 'DRAFT' OR kind='QUICK'`)).s === (await one(B, `SELECT SUM(total) s FROM sale WHERE status <> 'DRAFT' OR kind='QUICK'`)).s)

// ── deletes travel as tombstones ─────────────────────────────────────
await A.run(`DELETE FROM category WHERE id = 'cat1'`)
await ship(A, B)
check('category deleted on B', !(await one(B, `SELECT 1 x FROM category WHERE id='cat1'`)))
check('items of deleted category kept, unassigned', (await one(B, `SELECT category_id FROM item WHERE id='it1'`)).category_id === null)
await B.run(`DELETE FROM customer_ledger WHERE id = 'g1'`)
await ship(B, A)
check('ledger entry delete reaches A', !(await one(A, `SELECT 1 x FROM customer_ledger WHERE id='g1'`)))

// ── edit after delete wins over the old tombstone ───────────────────
await A.run(`INSERT INTO category (id, name, sort, active, created_at, updated_at) VALUES ('cat2', 'Tea', 2, 1, ?, ?)`, [6_000, 6_000])
await ship(A, B)
const tomb = { v: 1, app: 'kitroid-pos', schema: POS_MIGRATIONS.length, device: 'X', created_at: 0, ops: [{ e: 'category', id: 'cat2', at: 5_500, del: true }] } as ChangeFile
await applyChanges(B, tomb)
check('older tombstone does not delete a newer row', !!(await one(B, `SELECT 1 x FROM category WHERE id='cat2'`)))

// ── day close / reopen ───────────────────────────────────────────────
await A.run(`INSERT INTO day_close (business_date, currency, sale_count, item_count, gross, discount, net, closed_at) VALUES ('2026-11-16', 'KHR', 2, 4, 25000, 0, 25000, ?)`, [7_000])
await ship(A, B)
check('day close reaches B', !!(await one(B, `SELECT 1 x FROM day_close WHERE business_date='2026-11-16'`)))

// ── unknown column from a newer app version is ignored ──────────────
const future = { v: 1, app: 'kitroid-pos', schema: POS_MIGRATIONS.length, device: 'X', created_at: 0,
  ops: [{ e: 'customer', id: 'c9', at: 9_000, row: { id: 'c9', name: 'Dara', active: 1, created_at: 9_000, updated_at: 9_000, loyalty_points: 5 } }] } as ChangeFile
check('extra columns from newer devices are dropped', (await applyChanges(B, future)) === 1 && (await one(B, `SELECT name FROM customer WHERE id='c9'`)).name === 'Dara')

// ── markAllDirty sends everything (device that turns sync on later) ─
const C = device('C')
await markAllDirty(A)
await ship(A, C)
check('new device gets the whole shop', (await one(C, `SELECT COUNT(*) n FROM sale WHERE id IN ('s1','q1')`)).n === 2 && (await one(C, `SELECT COUNT(*) n FROM item`)).n === 1)
check('foreign keys back on after apply', (await one(C, `PRAGMA foreign_keys`)).foreign_keys === 1)
const fk = await C.query(`PRAGMA foreign_key_check`)
check('no broken references on the new device', fk.length === 0, fk)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
