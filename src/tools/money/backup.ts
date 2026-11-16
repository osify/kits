/**
 * Income & Expense backups: one .zip (money.sqlite3 + receipt photos) to download, to the
 * user's Google Drive (My Drive / Kitroid / Income & Expense / <book>), or restored from either.
 */
import { reactive } from 'vue'
import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate'
import { db, dbState } from './db'
import { getSettings, referencedPhotos } from './db/data'
import { migrate } from '@/core/db/migrate'
import { MONEY_MIGRATIONS } from './db/schema'
import { getImage, putImage } from '@/core/files/images'
import { prefs } from '@/core/util/prefs'
import { downloadBackup as driveDownload, hasToken, listShopFolders, listBackups, shopBackups, uploadBackup, type DriveFile } from '@/core/backup/drive'

const TOOL = 'money'

export const moneyBackup = reactive({
  lastBackupAt: Number(prefs.get('money.lastBackupAt') || 0),
  lastWriteAt: Number(prefs.get('money.lastWriteAt') || 0),
  running: false,
})
export const isDirty = () => moneyBackup.lastWriteAt > moneyBackup.lastBackupAt

let suppress = false
db.onWrite = () => {
  if (suppress) return
  moneyBackup.lastWriteAt = Date.now()
  prefs.set('money.lastWriteAt', String(moneyBackup.lastWriteAt))
}
function markDone() {
  moneyBackup.lastBackupAt = Date.now()
  prefs.set('money.lastBackupAt', String(moneyBackup.lastBackupAt))
}

export function fileName(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `kitroid-money-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`
}

export async function buildArchive(): Promise<{ bytes: Uint8Array; name: string }> {
  const files: Zippable = { 'money.sqlite3': [await db.exportBytes(), { level: 6 }] }
  for (const p of await referencedPhotos(db)) {
    const blob = await getImage(TOOL, p)
    if (blob) files[p] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  const s = await getSettings(db)
  files['manifest.json'] = strToU8(JSON.stringify({ app: 'kitroid-money', format: 1, schema: dbState.schemaVersion, created_at: Date.now(), book: s.book_name ?? null }, null, 2))
  return { bytes: zipSync(files), name: fileName() }
}

export async function downloadFile(): Promise<string> {
  const { bytes, name } = await buildArchive()
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  markDone()
  return name
}

export async function backupToDrive(): Promise<DriveFile> {
  moneyBackup.running = true
  try {
    const s = await getSettings(db)
    const { bytes, name } = await buildArchive()
    const f = await uploadBackup(s.book_id, s.book_name || 'Kitroid', name, bytes, TOOL)
    markDone()
    return f
  } finally {
    moneyBackup.running = false
  }
}

export async function driveFiles(): Promise<DriveFile[]> {
  const s = await getSettings(db)
  return s.book_id ? shopBackups(s.book_id, s.book_name || 'Kitroid', TOOL) : []
}
export const driveBooks = () => listShopFolders(TOOL)
export const driveBookFiles = (folderId: string) => listBackups(folderId)

/** Replace this device's book with a backup (.zip from Kitroid Income & Expense). */
export async function restore(bytes: Uint8Array): Promise<void> {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('NOT_BACKUP')
  const files = unzipSync(bytes)
  if (!files['money.sqlite3']) throw new Error('NOT_BACKUP')
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith('images/') && data.byteLength) await putImage(TOOL, path, new Blob([data as BlobPart], { type: path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }))
  }
  suppress = true
  try {
    await db.importBytes(files['money.sqlite3'].slice())
    dbState.schemaVersion = await migrate(db, MONEY_MIGRATIONS)
  } finally {
    suppress = false
  }
  markDone()
}

export async function restoreFromDrive(fileId: string) {
  await restore(await driveDownload(fileId))
}

export function readManifest(bytes: Uint8Array): { book: string | null; created_at: number } | null {
  try {
    const out = unzipSync(bytes, { filter: (f) => f.name === 'manifest.json' })
    return out['manifest.json'] ? JSON.parse(strFromU8(out['manifest.json'])) : null
  } catch {
    return null
  }
}

/** Automatic Drive backup every 30 minutes while signed in and there are changes. */
let started = false
export function startAutoBackup() {
  if (started) return
  started = true
  const tick = () => {
    if (!moneyBackup.running && isDirty() && hasToken() && Date.now() - moneyBackup.lastBackupAt > 30 * 60_000) backupToDrive().catch(() => {})
  }
  setInterval(tick, 5 * 60_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && tick())
}
