import { reactive } from 'vue'
import { SqliteClient } from '@/core/db/client'
import { migrate } from '@/core/db/migrate'
import { tryLock, takeOver, type TabLock } from '@/core/db/tabLock'
import type { Engine } from '@/core/db/protocol'
import { ulid } from '@/core/util/id'
import { POS_MIGRATIONS } from './schema'

const DB_NAME = 'pos'

export const db = new SqliteClient(DB_NAME)

export const dbState = reactive({
  status: 'idle' as 'idle' | 'opening' | 'ready' | 'busy' | 'moved' | 'error',
  engine: null as Engine | null,
  sqliteVersion: '',
  schemaVersion: 0,
  deviceId: '',
  error: '',
})

let lock: TabLock | null = null

/** Another tab asked for the database: close it here and show the "moved" screen. */
async function onTakeover() {
  await db.close()
  dbState.status = 'moved'
}

async function afterLock() {
  const info = await db.open()
  dbState.engine = info.engine
  dbState.sqliteVersion = info.sqliteVersion
  dbState.schemaVersion = await migrate(db, POS_MIGRATIONS)
  dbState.deviceId = await ensureDeviceId()
  dbState.status = 'ready'
}

export async function openPosDb() {
  dbState.status = 'opening'
  dbState.error = ''
  try {
    lock = await tryLock(DB_NAME, onTakeover)
    if (!lock) {
      dbState.status = 'busy'
      return
    }
    await afterLock()
  } catch (err: any) {
    console.error('[pos-db]', err)
    dbState.status = 'error'
    dbState.error = err?.message ?? String(err)
  }
}

/** "Use here": take the database from the other tab. */
export async function useHere() {
  dbState.status = 'opening'
  try {
    lock = await takeOver(DB_NAME, onTakeover)
    await afterLock()
  } catch (err: any) {
    dbState.status = 'error'
    dbState.error = err?.message ?? String(err)
  }
}

// ── settings (key/value inside the database, so they are backed up too) ─────
export async function getSetting(key: string): Promise<string | null> {
  const r = await db.get<{ value: string }>(`SELECT value FROM setting WHERE key = ?`, [key])
  return r?.value ?? null
}

export async function setSetting(key: string, value: string) {
  await db.run(
    `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  )
}

/**
 * The device id is per browser install. It is kept in a device pref, NOT in the
 * database, so restoring a backup onto a new phone does not clone the old phone's id.
 */
async function ensureDeviceId(): Promise<string> {
  const { prefs } = await import('@/core/util/prefs')
  let id = prefs.get('device_id')
  if (!id) {
    id = ulid()
    prefs.set('device_id', id)
  }
  return id
}
