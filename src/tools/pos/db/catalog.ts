import { db } from './index'
import { ulid } from '@/core/util/id'
import type { Stmt } from '@/core/db/protocol'

export interface Category {
  id: string
  name: string
  name_km: string | null
  color: string | null
  icon: string | null
  sort: number
  active: number
}

export interface Item {
  id: string
  category_id: string | null
  name: string
  name_km: string | null
  sku: string | null
  barcode: string | null
  price: number
  cost: number | null
  image_path: string | null
  icon: string | null
  sort: number
  active: number
  track_stock: number
  low_stock: number | null
}

export interface ModifierOption {
  id: string
  group_id: string
  name: string
  name_km: string | null
  price_delta: number
  sort: number
}

export interface ModifierGroup {
  id: string
  name: string
  name_km: string | null
  min_select: number
  max_select: number
  sort: number
  options: ModifierOption[]
}

// ── categories ──────────────────────────────────────────────────────────────
export function listCategories(includeInactive = false): Promise<Category[]> {
  return db.query<Category>(`SELECT * FROM category ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, name`)
}

export async function saveCategory(c: Partial<Category> & { name: string }): Promise<string> {
  const now = Date.now()
  if (c.id) {
    await db.run(`UPDATE category SET name = ?, name_km = ?, color = ?, icon = ?, sort = ?, active = ?, updated_at = ? WHERE id = ?`, [
      c.name,
      c.name_km ?? null,
      c.color ?? null,
      c.icon ?? null,
      c.sort ?? 0,
      c.active ?? 1,
      now,
      c.id,
    ])
    return c.id
  }
  const id = ulid()
  const sort = c.sort ?? ((await db.get<{ m: number }>(`SELECT COALESCE(MAX(sort), 0) + 1 AS m FROM category`))?.m ?? 0)
  await db.run(
    `INSERT INTO category (id, name, name_km, color, icon, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, c.name, c.name_km ?? null, c.color ?? null, c.icon ?? null, sort, c.active ?? 1, now, now],
  )
  return id
}

/** Items keep their history; deleting a category only un-assigns its items. */
export function deleteCategory(id: string) {
  return db.run(`DELETE FROM category WHERE id = ?`, [id])
}

// ── items ───────────────────────────────────────────────────────────────────
export function listItems(includeInactive = false): Promise<Item[]> {
  return db.query<Item>(
    `SELECT i.* FROM item i LEFT JOIN category c ON c.id = i.category_id
     ${includeInactive ? '' : 'WHERE i.active = 1'}
     ORDER BY COALESCE(c.sort, 9999), i.sort, i.name`,
  )
}

export async function saveItem(it: Partial<Item> & { name: string; price: number }): Promise<string> {
  const now = Date.now()
  const barcode = it.barcode?.trim() || null
  if (it.id) {
    await db.run(
      `UPDATE item SET category_id = ?, name = ?, name_km = ?, sku = ?, barcode = ?, price = ?, cost = ?, image_path = ?, icon = ?, sort = ?, active = ?, track_stock = ?, low_stock = ?, updated_at = ? WHERE id = ?`,
      [
        it.category_id ?? null,
        it.name,
        it.name_km ?? null,
        it.sku ?? null,
        barcode,
        it.price,
        it.cost ?? null,
        it.image_path ?? null,
        it.icon ?? null,
        it.sort ?? 0,
        it.active ?? 1,
        it.track_stock ?? 0,
        it.low_stock ?? null,
        now,
        it.id,
      ],
    )
    return it.id
  }
  const id = ulid()
  const sort = it.sort ?? ((await db.get<{ m: number }>(`SELECT COALESCE(MAX(sort), 0) + 1 AS m FROM item`))?.m ?? 0)
  await db.run(
    `INSERT INTO item (id, category_id, name, name_km, sku, barcode, price, cost, image_path, icon, sort, active, track_stock, low_stock, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      it.category_id ?? null,
      it.name,
      it.name_km ?? null,
      it.sku ?? null,
      barcode,
      it.price,
      it.cost ?? null,
      it.image_path ?? null,
      it.icon ?? null,
      sort,
      it.active ?? 1,
      it.track_stock ?? 0,
      it.low_stock ?? null,
      now,
      now,
    ],
  )
  return id
}

/** Sold items are hidden (active = 0) instead of deleted, so old sales keep their link. */
export async function deleteItem(id: string) {
  const used = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sale_line WHERE item_id = ?`, [id])
  if (used?.n) return db.run(`UPDATE item SET active = 0, updated_at = ? WHERE id = ?`, [Date.now(), id])
  return db.run(`DELETE FROM item WHERE id = ?`, [id])
}

// ── modifiers (add-ons: size, sugar, ice…) ──────────────────────────────────
export async function listModifierGroups(): Promise<ModifierGroup[]> {
  const groups = await db.query<Omit<ModifierGroup, 'options'>>(`SELECT * FROM modifier_group ORDER BY sort, name`)
  const opts = await db.query<ModifierOption>(`SELECT * FROM modifier_option ORDER BY sort, name`)
  return groups.map((g) => ({ ...g, options: opts.filter((o) => o.group_id === g.id) }))
}

/** item_id → group ids, for every item */
export async function itemModifierMap(): Promise<Map<string, string[]>> {
  const rows = await db.query<{ item_id: string; group_id: string }>(`SELECT item_id, group_id FROM item_modifier_group ORDER BY sort`)
  const m = new Map<string, string[]>()
  for (const r of rows) m.set(r.item_id, [...(m.get(r.item_id) ?? []), r.group_id])
  return m
}

export async function saveModifierGroup(g: Omit<ModifierGroup, 'id' | 'sort'> & { id?: string; sort?: number }): Promise<string> {
  const now = Date.now()
  const id = g.id ?? ulid()
  const stmts: Stmt[] = []
  if (g.id) {
    stmts.push({
      sql: `UPDATE modifier_group SET name = ?, name_km = ?, min_select = ?, max_select = ?, updated_at = ? WHERE id = ?`,
      bind: [g.name, g.name_km ?? null, g.min_select, g.max_select, now, id],
    })
  } else {
    stmts.push({
      sql: `INSERT INTO modifier_group (id, name, name_km, min_select, max_select, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM modifier_group), ?, ?)`,
      bind: [id, g.name, g.name_km ?? null, g.min_select, g.max_select, now, now],
    })
  }
  // Options are replaced as a set; sale lines keep a JSON snapshot so history is safe.
  stmts.push({ sql: `DELETE FROM modifier_option WHERE group_id = ?`, bind: [id] })
  g.options.forEach((o, i) =>
    stmts.push({
      sql: `INSERT INTO modifier_option (id, group_id, name, name_km, price_delta, sort) VALUES (?, ?, ?, ?, ?, ?)`,
      bind: [o.id || ulid(), id, o.name, o.name_km ?? null, o.price_delta || 0, i],
    }),
  )
  await db.batch(stmts)
  return id
}

export function deleteModifierGroup(id: string) {
  return db.run(`DELETE FROM modifier_group WHERE id = ?`, [id])
}

export async function setItemModifierGroups(itemId: string, groupIds: string[]) {
  await db.batch([
    { sql: `DELETE FROM item_modifier_group WHERE item_id = ?`, bind: [itemId] },
    { sql: `UPDATE item SET updated_at = ? WHERE id = ?`, bind: [Date.now(), itemId] },
    ...groupIds.map((g, i) => ({ sql: `INSERT INTO item_modifier_group (item_id, group_id, sort) VALUES (?, ?, ?)`, bind: [itemId, g, i] })),
  ])
}

// ── templates (recommended business setups) ─────────────────────────────────
export interface TemplateIndexEntry {
  id: string
  name: string
  name_km: string
  description: string
  description_km: string
  icon: string
}

export interface Template {
  id: string
  currency: 'KHR' | 'USD'
  modifiers?: { key: string; name: string; name_km: string; min: number; max: number; options: { name: string; name_km: string; price: number }[] }[]
  categories: {
    name: string
    name_km: string
    color?: string
    icon?: string
    items: { name: string; name_km: string; price: number; icon?: string; modifiers?: string[] }[]
  }[]
}

export async function fetchTemplateIndex(): Promise<TemplateIndexEntry[]> {
  const r = await fetch('/pos/templates/index.json')
  if (!r.ok) throw new Error(`templates: ${r.status}`)
  return r.json()
}

export async function fetchTemplate(id: string): Promise<Template> {
  const r = await fetch(`/pos/templates/${encodeURIComponent(id)}.json`)
  if (!r.ok) throw new Error(`template ${id}: ${r.status}`)
  return r.json()
}

/**
 * Add a template's categories, items and add-ons to the shop (in one transaction).
 * Prices in the template are in its own currency; they are converted to the shop's.
 */
export async function applyTemplate(t: Template, shopCurrency: 'KHR' | 'USD', khrPerUsd: number) {
  const now = Date.now()
  const conv = (price: number) => {
    // template prices: KHR = riel, USD = dollars
    if (t.currency === shopCurrency) return shopCurrency === 'USD' ? Math.round(price * 100) : price
    if (shopCurrency === 'USD') return Math.round((price / khrPerUsd) * 100) // riel → cents
    return Math.round((price * khrPerUsd) / 100) * 100 // dollars → riel (100 ៛ steps)
  }
  const stmts: Stmt[] = []
  const modIds = new Map<string, string>()
  const base = (await db.get<{ c: number; i: number; m: number }>(
    `SELECT (SELECT COALESCE(MAX(sort),0) FROM category) AS c, (SELECT COALESCE(MAX(sort),0) FROM item) AS i, (SELECT COALESCE(MAX(sort),0) FROM modifier_group) AS m`,
  ))!
  ;(t.modifiers ?? []).forEach((m, gi) => {
    const gid = ulid()
    modIds.set(m.key, gid)
    stmts.push({
      sql: `INSERT INTO modifier_group (id, name, name_km, min_select, max_select, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [gid, m.name, m.name_km, m.min, m.max, base.m + gi + 1, now, now],
    })
    m.options.forEach((o, oi) =>
      stmts.push({
        sql: `INSERT INTO modifier_option (id, group_id, name, name_km, price_delta, sort) VALUES (?, ?, ?, ?, ?, ?)`,
        bind: [ulid(), gid, o.name, o.name_km, conv(o.price), oi],
      }),
    )
  })
  let itemSort = base.i
  t.categories.forEach((c, ci) => {
    const cid = ulid()
    stmts.push({
      sql: `INSERT INTO category (id, name, name_km, color, icon, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      bind: [cid, c.name, c.name_km, c.color ?? null, c.icon ?? null, base.c + ci + 1, now, now],
    })
    for (const it of c.items) {
      const iid = ulid()
      stmts.push({
        sql: `INSERT INTO item (id, category_id, name, name_km, price, icon, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        bind: [iid, cid, it.name, it.name_km, conv(it.price), it.icon ?? null, ++itemSort, now, now],
      })
      ;(it.modifiers ?? []).forEach((key, mi) => {
        const gid = modIds.get(key)
        if (gid) stmts.push({ sql: `INSERT INTO item_modifier_group (item_id, group_id, sort) VALUES (?, ?, ?)`, bind: [iid, gid, mi] })
      })
    }
  })
  await db.batch(stmts)
}

/** Every image path referenced by the database (for backups and cleanup). */
export async function referencedImages(): Promise<Set<string>> {
  const rows = await db.query<{ p: string }>(
    `SELECT image_path AS p FROM item WHERE image_path IS NOT NULL
     UNION SELECT khqr_image FROM shop WHERE khqr_image IS NOT NULL
     UNION SELECT logo_image FROM shop WHERE logo_image IS NOT NULL`,
  )
  return new Set(rows.map((r) => r.p))
}

// ── plan limit: items on sale ────────────────────────────────────────────────
export async function countActiveItems(): Promise<number> {
  return (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM item WHERE active = 1`))?.n ?? 0
}

export interface LimitCheck {
  ok: boolean
  used: number
  max: number
}

/** Can `adding` more items be put on sale under the current plan? */
export async function checkItemLimit(adding: number, max: number): Promise<LimitCheck> {
  const used = await countActiveItems()
  return { ok: used + adding <= max, used, max }
}

/** Number of items a template would add. */
export function templateItemCount(t: Template): number {
  return t.categories.reduce((s, c) => s + c.items.length, 0)
}
