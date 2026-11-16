import { db } from './index'
import { ulid } from '@/core/util/id'
import type { Currency } from '@/core/util/money'

export interface Shop {
  id: string
  name: string
  name_km: string | null
  phone: string | null
  address: string | null
  base_currency: Currency
  show_dual: number
  khr_per_usd: number
  riel_step: number
  template_id: string | null
  receipt_header: string | null
  receipt_footer: string | null
  khqr_image: string | null
  logo_image: string | null
  paper_mm: number
  created_at: number
  updated_at: number
}

export type ShopInput = Partial<Omit<Shop, 'id' | 'created_at' | 'updated_at'>> & { name: string }

const FIELDS = [
  'name',
  'name_km',
  'phone',
  'address',
  'base_currency',
  'show_dual',
  'khr_per_usd',
  'riel_step',
  'template_id',
  'receipt_header',
  'receipt_footer',
  'khqr_image',
  'logo_image',
  'paper_mm',
] as const

export function getShop(): Promise<Shop | undefined> {
  return db.get<Shop>(`SELECT * FROM shop ORDER BY created_at LIMIT 1`)
}

export async function saveShop(input: ShopInput): Promise<Shop> {
  const now = Date.now()
  const existing = await getShop()
  if (existing) {
    const keys = FIELDS.filter((k) => k in input)
    if (keys.length) {
      await db.run(`UPDATE shop SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
        ...keys.map((k) => (input as any)[k] ?? null),
        now,
        existing.id,
      ])
    }
  } else {
    const keys = FIELDS.filter((k) => k in input)
    await db.run(
      `INSERT INTO shop (id, ${keys.join(', ')}, created_at, updated_at) VALUES (?, ${keys.map(() => '?').join(', ')}, ?, ?)`,
      [ulid(), ...keys.map((k) => (input as any)[k] ?? null), now, now],
    )
  }
  return (await getShop())!
}
