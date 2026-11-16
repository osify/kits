/**
 * Multi-device sync through the shop's Google Drive folder.
 *
 *   My Drive / Kitroid / POS / <shop> / sync / <ulid>_<device>.json.gz
 *
 * Each device uploads its own changes and applies everyone else's (see engine.ts).
 * A device joins a shop by restoring a backup of that shop (so it shares the shop id),
 * then turning sync on. Runs only while a Google token is valid (about 1 hour after sign-in).
 */
import { reactive, ref } from 'vue'
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { db, dbState } from '../db'
import { getShop } from '../db/shop'
import { prefs } from '@/core/util/prefs'
import { ulid } from '@/core/util/id'
import { hasToken, syncFolder, listSyncFiles, uploadSyncFile, downloadBackup, deleteDriveFile, driveSignedIn } from '../backup/drive'
import { ackChanges, applyChanges, collectChanges, markAllDirty, pendingCount, type ChangeFile } from './engine'

const KEEP_DAYS = 60

export const syncState = reactive({
  enabled: prefs.get('pos.sync') === '1',
  running: false,
  lastSync: Number(prefs.get('pos.lastSync') || 0),
  lastError: '',
  pending: 0,
  devices: Number(prefs.get('pos.syncDevices') || 0),
})

/** Bumped whenever changes from another device were applied: screens reload their data. */
export const dataVersion = ref(0)
let onApplied: (() => Promise<void>) | null = null
export function setOnApplied(fn: () => Promise<void>) {
  onApplied = fn
}

export async function refreshPending() {
  if (dbState.status === 'ready') syncState.pending = await pendingCount(db)
}

export async function enableSync() {
  prefs.set('pos.sync', '1')
  syncState.enabled = true
  await markAllDirty(db) // first sync from this device sends everything it has
  await refreshPending()
}

export function disableSync() {
  prefs.set('pos.sync', '0')
  syncState.enabled = false
}

export async function syncNow(): Promise<{ pushed: number; applied: number }> {
  if (syncState.running) return { pushed: 0, applied: 0 }
  if (!hasToken()) {
    driveSignedIn.value = false
    throw new Error('NEED_SIGN_IN')
  }
  syncState.running = true
  syncState.lastError = ''
  try {
    const shop = await getShop()
    if (!shop) throw new Error('No shop')
    const folder = await syncFolder(shop.id, shop.name)

    // 1. push
    const { ops, dirty } = await collectChanges(db)
    if (ops.length) {
      const file: ChangeFile = { v: 1, app: 'kitroid-pos', schema: dbState.schemaVersion, device: dbState.deviceId, created_at: Date.now(), ops }
      await uploadSyncFile(folder, `${ulid()}_${dbState.deviceId}.json.gz`, gzipSync(strToU8(JSON.stringify(file))), dbState.deviceId)
    }
    await ackChanges(db, dirty)

    // 2. pull
    const files = await listSyncFiles(folder)
    const seen = new Set((await db.query<{ file_id: string }>(`SELECT file_id FROM _sync_seen`)).map((r) => r.file_id))
    const devices = new Set(files.map((f) => f.appProperties?.device).filter(Boolean))
    devices.add(dbState.deviceId)
    syncState.devices = devices.size
    prefs.set('pos.syncDevices', String(devices.size))
    let applied = 0
    for (const f of files) {
      if (seen.has(f.id) || f.appProperties?.device === dbState.deviceId) continue
      const change = JSON.parse(strFromU8(gunzipSync(await downloadBackup(f.id)))) as ChangeFile
      if (change.app !== 'kitroid-pos') continue
      if (change.schema > dbState.schemaVersion) throw new Error('NEED_UPDATE')
      applied += await applyChanges(db, change)
      await db.run(`INSERT OR IGNORE INTO _sync_seen (file_id, device_id, applied_at) VALUES (?, ?, ?)`, [f.id, change.device, Date.now()])
    }

    // 3. tidy: each device removes its own old change files
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000
    for (const f of files) {
      if (f.appProperties?.device === dbState.deviceId && Date.parse(f.createdTime) < cutoff) await deleteDriveFile(f.id).catch(() => {})
    }

    syncState.lastSync = Date.now()
    prefs.set('pos.lastSync', String(syncState.lastSync))
    if (applied) {
      dataVersion.value++
      await onApplied?.()
    }
    return { pushed: ops.length, applied }
  } catch (e: any) {
    syncState.lastError = e?.message ?? String(e)
    throw e
  } finally {
    syncState.running = false
    await refreshPending()
  }
}

/** Not synced for longer than change files are kept: this device may have missed changes. */
export function syncIsStale(): boolean {
  return syncState.enabled && !!syncState.lastSync && Date.now() - syncState.lastSync > (KEEP_DAYS - 5) * 86_400_000
}

let started = false
/** Background sync while signed in: push soon after changes, pull every 2 minutes and on return to the app. */
export function startAutoSync() {
  if (started) return
  started = true
  const tick = async (force = false) => {
    if (!syncState.enabled || syncState.running || !hasToken() || dbState.status !== 'ready') return
    await refreshPending()
    if (force || syncState.pending > 0 || Date.now() - syncState.lastSync > 120_000) await syncNow().catch(() => {})
  }
  setInterval(() => tick(), 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick(true)
  })
  refreshPending()
}
