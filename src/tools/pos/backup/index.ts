/**
 * Backup orchestration: manual + automatic backups to Google Drive and/or a PC folder.
 *
 * "Dirty" = data changed since the last successful backup on this device.
 * Automatic backup runs (only when dirty) every 30 minutes, when the app goes to the
 * background, and after a day is closed, using whatever targets are ready
 * (valid Drive token, folder permission). Nothing ever blocks selling.
 */
import { reactive } from 'vue'
import { db } from '../db'
import { getShop } from '../db/shop'
import { logBackup } from '../db/reports'
import { prefs } from '@/core/util/prefs'
import { buildArchive } from './archive'
import { driveConfigured, hasToken, uploadBackup } from './drive'
import { folderPermission, folderSupported, initFolder, writeToFolder, folderName } from './folder'

const num = (k: string) => Number(prefs.get(k) || 0)

export const backupState = reactive({
  lastWriteAt: num('pos.lastWriteAt'),
  lastBackupAt: num('pos.lastBackupAt'),
  lastDriveAt: num('pos.lastDriveAt'),
  lastFolderAt: num('pos.lastFolderAt'),
  autoDrive: prefs.get('pos.autoDrive') !== '0',
  autoFolder: prefs.get('pos.autoFolder') !== '0',
  running: false,
  lastError: '',
})

export const isDirty = () => backupState.lastWriteAt > backupState.lastBackupAt

let suppress = false
let writeTimer: ReturnType<typeof setTimeout> | null = null
db.onWrite = () => {
  if (suppress) return
  backupState.lastWriteAt = Date.now()
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => prefs.set('pos.lastWriteAt', String(backupState.lastWriteAt)), 500)
}

export function setAuto(kind: 'drive' | 'folder', on: boolean) {
  if (kind === 'drive') backupState.autoDrive = on
  else backupState.autoFolder = on
  prefs.set(kind === 'drive' ? 'pos.autoDrive' : 'pos.autoFolder', on ? '1' : '0')
}

function markDone(target: 'drive' | 'folder' | 'download') {
  const now = Date.now()
  backupState.lastBackupAt = now
  prefs.set('pos.lastBackupAt', String(now))
  if (target === 'drive') {
    backupState.lastDriveAt = now
    prefs.set('pos.lastDriveAt', String(now))
  } else if (target === 'folder') {
    backupState.lastFolderAt = now
    prefs.set('pos.lastFolderAt', String(now))
  }
}

/** Writing the backup log must not make the data "dirty" again. */
async function quietLog(...args: Parameters<typeof logBackup>) {
  suppress = true
  try {
    await logBackup(...args)
  } finally {
    suppress = false
  }
}

export interface BackupResult {
  drive?: 'ok' | 'skipped' | string
  folder?: 'ok' | 'skipped' | string
}

/** Run a backup to the given targets. Returns per-target result (error text on failure). */
export async function runBackup(targets: { drive?: boolean; folder?: boolean }): Promise<BackupResult> {
  if (backupState.running) return {}
  backupState.running = true
  backupState.lastError = ''
  const res: BackupResult = {}
  try {
    const shop = await getShop()
    const { bytes, name } = await buildArchive()
    if (targets.drive) {
      try {
        if (!shop) throw new Error('Set up your shop first')
        const f = await uploadBackup(shop.id, shop.name, name, bytes)
        await quietLog('DRIVE', true, { bytes: bytes.byteLength, file: name, remoteId: f.id })
        markDone('drive')
        res.drive = 'ok'
      } catch (e: any) {
        res.drive = e?.message ?? String(e)
        if (res.drive !== 'NEED_SIGN_IN') await quietLog('DRIVE', false, { file: name, error: res.drive })
      }
    }
    if (targets.folder) {
      try {
        await writeToFolder(name, bytes)
        await quietLog('FOLDER', true, { bytes: bytes.byteLength, file: name })
        markDone('folder')
        res.folder = 'ok'
      } catch (e: any) {
        res.folder = e?.message ?? String(e)
        if (res.folder !== 'NEED_PERMISSION') await quietLog('FOLDER', false, { file: name, error: res.folder })
      }
    }
    const errs = [res.drive, res.folder].filter((r) => r && r !== 'ok' && r !== 'skipped')
    backupState.lastError = errs.join(' · ')
  } finally {
    backupState.running = false
  }
  return res
}

/** Download a backup file (always works, no account needed). */
export async function downloadBackupFile(): Promise<string> {
  const { bytes, name } = await buildArchive()
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  await quietLog('DOWNLOAD', true, { bytes: bytes.byteLength, file: name })
  markDone('download')
  return name
}

const AUTO_EVERY = 30 * 60 * 1000

/** Background check; safe to call often. */
export async function autoBackup(force = false) {
  if (backupState.running || !isDirty()) return
  if (!force && Date.now() - backupState.lastBackupAt < AUTO_EVERY) return
  const drive = driveConfigured && backupState.autoDrive && hasToken()
  const folder = folderSupported && backupState.autoFolder && !!folderName.value && (await folderPermission()) === 'granted'
  if (!drive && !folder) return
  await runBackup({ drive, folder })
}

let started = false
export function startAutoBackup() {
  if (started) return
  started = true
  initFolder()
  setInterval(() => autoBackup().catch(() => {}), 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoBackup().catch(() => {})
  })
}

/** Days since the last backup of any kind (Infinity if never). */
export function daysSinceBackup(): number {
  if (!backupState.lastBackupAt) return Infinity
  return (Date.now() - backupState.lastBackupAt) / 86_400_000
}
