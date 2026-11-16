import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate'
import { db, dbState } from '../db'
import { migrate } from '@/core/db/migrate'
import { POS_MIGRATIONS } from '../db/schema'
import { getImage, putImage } from '@/core/files/images'
import { referencedImages } from '../db/catalog'

/**
 * Backup file format (.zip, opens with any unzip tool):
 *   manifest.json   app, schema version, time, counts
 *   pos.sqlite3     the whole database (open with "DB Browser for SQLite")
 *   images/*.webp   item photos, KHQR and logo images
 */
export const TOOL = 'pos'

export interface BackupManifest {
  app: 'kitroid-pos'
  format: 1
  schema: number
  created_at: number
  device_id: string
  shop: string | null
  images: number
}

export function backupFileName(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `kitroid-pos-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`
}

export async function buildArchive(): Promise<{ bytes: Uint8Array; name: string; manifest: BackupManifest }> {
  const sqlite = await db.exportBytes()
  const files: Zippable = { 'pos.sqlite3': [sqlite, { level: 6 }] }
  let images = 0
  for (const p of await referencedImages()) {
    const blob = await getImage(TOOL, p)
    if (!blob) continue
    files[p] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }] // already compressed
    images++
  }
  const shop = await db.get<{ name: string }>(`SELECT name FROM shop LIMIT 1`)
  const manifest: BackupManifest = {
    app: 'kitroid-pos',
    format: 1,
    schema: dbState.schemaVersion,
    created_at: Date.now(),
    device_id: dbState.deviceId,
    shop: shop?.name ?? null,
    images,
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  return { bytes: zipSync(files), name: backupFileName(), manifest }
}

/** Peek at a backup before restoring (shop name, date). */
export function readManifest(bytes: Uint8Array): BackupManifest | null {
  if (!isZip(bytes)) return null
  try {
    const out = unzipSync(bytes, { filter: (f) => f.name === 'manifest.json' })
    return out['manifest.json'] ? JSON.parse(strFromU8(out['manifest.json'])) : null
  } catch {
    return null
  }
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b
const isSqlite = (b: Uint8Array) => strFromU8(b.subarray(0, 15)) === 'SQLite format 3'

/**
 * Replace this device's data with a backup (.zip from Kitroid, or a bare .sqlite file).
 * Older backups are migrated to the current schema after import.
 */
export async function restoreArchive(bytes: Uint8Array): Promise<void> {
  let sqlite: Uint8Array
  let images: Record<string, Uint8Array> = {}
  if (isZip(bytes)) {
    const files = unzipSync(bytes)
    if (!files['pos.sqlite3']) throw new Error('This zip is not a Kitroid POS backup')
    sqlite = files['pos.sqlite3']
    images = Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith('images/') && files[k].byteLength))
  } else if (isSqlite(bytes)) {
    sqlite = bytes
  } else {
    throw new Error('Unknown file. Choose a Kitroid backup (.zip) or a .sqlite file.')
  }
  for (const [path, data] of Object.entries(images)) {
    const type = path.endsWith('.webp') ? 'image/webp' : path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    await putImage(TOOL, path, new Blob([data as BlobPart], { type }))
  }
  // copy: importBytes transfers (detaches) the buffer
  await db.importBytes(sqlite.slice())
  dbState.schemaVersion = await migrate(db, POS_MIGRATIONS)
}
