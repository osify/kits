/**
 * Backups for any single-database tool: one .zip (<name>.sqlite3 + images/ + manifest.json)
 * to download, to the user's Google Drive (My Drive / Kitroid / <tool folder> / <book>),
 * or restored from either. Tracks "changed since last backup" and runs an automatic Drive
 * backup every 30 minutes while signed in.
 */
import { reactive } from 'vue'
import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate'
import type { SqliteClient } from '@/core/db/client'
import { migrate, type Migration } from '@/core/db/migrate'
import { getImage, putImage } from '@/core/files/images'
import { prefs } from '@/core/util/prefs'
import { decryptBytes, encryptBytes, getBackupKey, isEncrypted } from '@/core/privacy/crypto'
import { downloadBackup as driveDownload, hasToken, listShopFolders, listBackups, shopBackups, uploadBackup, type DriveFile } from './drive'

export interface ToolBackupOptions {
  tool: string // 'crm' — Drive folder key, image store and file prefix
  db: SqliteClient
  migrations: Migration[]
  /** book id + name used for the Drive folder */
  book: () => Promise<{ id: string; name: string }>
  /** image paths referenced by the database */
  photos: () => Promise<string[]>
  onSchema?: (v: number) => void
  /** Offer password-encrypted backups (private data such as health records). */
  encryptable?: boolean
}

export function createToolBackup(o: ToolBackupOptions) {
  const key = (k: string) => `${o.tool}.${k}`
  const state = reactive({
    lastBackupAt: Number(prefs.get(key('lastBackupAt')) || 0),
    lastWriteAt: Number(prefs.get(key('lastWriteAt')) || 0),
    firstUse: Number(prefs.get(key('firstUse')) || 0),
    running: false,
  })
  let suppress = false
  o.db.onWrite = () => {
    if (suppress) return
    state.lastWriteAt = Date.now()
    prefs.set(key('lastWriteAt'), String(state.lastWriteAt))
    if (!state.firstUse) {
      state.firstUse = state.lastWriteAt
      prefs.set(key('firstUse'), String(state.firstUse))
    }
  }
  const markDone = () => {
    state.lastBackupAt = Date.now()
    prefs.set(key('lastBackupAt'), String(state.lastBackupAt))
  }
  const isDirty = () => state.lastWriteAt > state.lastBackupAt
  /** Changes not backed up for 3 days (counted from first use if never backed up). */
  const needsReminder = () => isDirty() && Date.now() - (state.lastBackupAt || state.firstUse || Date.now()) > 3 * 86_400_000

  const fileName = (d = new Date()) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `kitroid-${o.tool}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`
  }

  async function buildArchive() {
    const files: Zippable = { [`${o.tool}.sqlite3`]: [await o.db.exportBytes(), { level: 6 }] }
    for (const p of await o.photos()) {
      const blob = await getImage(o.tool, p)
      if (blob) files[p] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    }
    const b = await o.book()
    files['manifest.json'] = strToU8(JSON.stringify({ app: `kitroid-${o.tool}`, format: 1, created_at: Date.now(), book: b.name }, null, 2))
    const zip = zipSync(files)
    const k = o.encryptable ? await getBackupKey(o.tool) : null
    if (!k) return { bytes: zip, name: fileName() }
    return { bytes: await encryptBytes(zip, k.key, k.salt), name: fileName().replace(/\.zip$/, '.kitroid') }
  }

  async function downloadFile() {
    const { bytes, name } = await buildArchive()
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: name.endsWith('.zip') ? 'application/zip' : 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    markDone()
    return name
  }

  async function backupToDrive(): Promise<DriveFile> {
    state.running = true
    try {
      const b = await o.book()
      const { bytes, name } = await buildArchive()
      const f = await uploadBackup(b.id, b.name || 'Kitroid', name, bytes, o.tool)
      markDone()
      return f
    } finally {
      state.running = false
    }
  }

  async function driveFiles(): Promise<DriveFile[]> {
    const b = await o.book()
    return b.id ? shopBackups(b.id, b.name || 'Kitroid', o.tool) : []
  }

  /** Restore a backup. Encrypted backups need `password` (throws NEED_PASSWORD / BAD_PASSWORD). */
  async function restore(bytes: Uint8Array, password?: string) {
    if (isEncrypted(bytes)) {
      if (!password) throw new Error('NEED_PASSWORD')
      bytes = await decryptBytes(bytes, password)
    }
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('NOT_BACKUP')
    const files = unzipSync(bytes)
    const dbFile = files[`${o.tool}.sqlite3`]
    if (!dbFile) throw new Error('NOT_BACKUP')
    for (const [path, data] of Object.entries(files)) {
      if (path.startsWith('images/') && data.byteLength) await putImage(o.tool, path, new Blob([data as BlobPart], { type: path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }))
    }
    suppress = true
    try {
      await o.db.importBytes(dbFile.slice())
      o.onSchema?.(await migrate(o.db, o.migrations))
    } finally {
      suppress = false
    }
    markDone()
  }

  function readManifest(bytes: Uint8Array): { book: string | null; created_at: number } | null {
    try {
      const out = unzipSync(bytes, { filter: (f) => f.name === 'manifest.json' })
      return out['manifest.json'] ? JSON.parse(strFromU8(out['manifest.json'])) : null
    } catch {
      return null
    }
  }

  let started = false
  function startAutoBackup() {
    if (started) return
    started = true
    const tick = () => {
      if (!state.running && isDirty() && hasToken() && Date.now() - state.lastBackupAt > 30 * 60_000) backupToDrive().catch(() => {})
    }
    setInterval(tick, 5 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && tick())
  }

  return {
    state,
    isDirty,
    needsReminder,
    buildArchive,
    downloadFile,
    backupToDrive,
    driveFiles,
    driveBooks: () => listShopFolders(o.tool),
    driveBookFiles: (folderId: string) => listBackups(folderId),
    restore,
    restoreFromDrive: async (fileId: string, password?: string) => restore(await driveDownload(fileId), password),
    encryptable: !!o.encryptable,
    tool: o.tool,
    readManifest,
    startAutoBackup,
  }
}

export type ToolBackup = ReturnType<typeof createToolBackup>
