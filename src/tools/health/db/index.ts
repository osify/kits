import { reactive } from 'vue'
import { SqliteClient } from '@/core/db/client'
import { migrate } from '@/core/db/migrate'
import { tryLock, takeOver, type TabLock } from '@/core/db/tabLock'
import type { Engine } from '@/core/db/protocol'
import { prefs } from '@/core/util/prefs'
import { ulid } from '@/core/util/id'
import { createToolBackup } from '@/core/backup/toolBackup'
import { createLock } from '@/core/privacy/lock'
import { clearBackupPassword } from '@/core/privacy/crypto'
import { pruneImages } from '@/core/files/images'
import { HEALTH_MIGRATIONS } from './schema'
import { getSettings, referencedPhotos } from './data'

/** The Health database (private): its own SQLite file and storage pool, one tab at a time. */
const DB_NAME = 'health'
export const db = new SqliteClient(DB_NAME)

export const dbState = reactive({
  status: 'idle' as 'idle' | 'opening' | 'ready' | 'busy' | 'moved' | 'error',
  engine: null as Engine | null,
  schemaVersion: 0,
  deviceId: '',
  error: '',
})

export const backup = createToolBackup({
  tool: 'health',
  db,
  migrations: HEALTH_MIGRATIONS,
  book: async () => {
    const s = await getSettings(db)
    return { id: s.book_id ?? '', name: s.book_name ?? '' }
  },
  photos: () => referencedPhotos(db),
  onSchema: (v) => (dbState.schemaVersion = v),
  encryptable: true,
})

/** PIN lock for this private tool. */
export const appLock = createLock('health')

/** Delete everything Health stored on this device (data, photos, backup key, PIN). */
export async function wipeHealth() {
  await db.batch(['dose', 'medicine', 'reading', 'appointment', 'record', 'person', 'setting'].map((t) => ({ sql: `DELETE FROM ${t}`, bind: [] })))
  await pruneImages('health', new Set()).catch(() => 0)
  await clearBackupPassword('health').catch(() => {})
  for (const k of ['lastBackupAt', 'lastWriteAt', 'firstUse']) prefs.remove(`health.${k}`)
}

let lock: TabLock | null = null
async function onTakeover() {
  await db.close()
  dbState.status = 'moved'
}
async function afterLock() {
  const info = await db.open()
  dbState.engine = info.engine
  dbState.schemaVersion = await migrate(db, HEALTH_MIGRATIONS)
  let id = prefs.get('device_id')
  if (!id) {
    id = ulid()
    prefs.set('device_id', id)
  }
  dbState.deviceId = id
  dbState.status = 'ready'
}

export async function openHealthDb() {
  dbState.status = 'opening'
  dbState.error = ''
  try {
    lock = await tryLock(DB_NAME, onTakeover)
    if (!lock) return void (dbState.status = 'busy')
    await afterLock()
  } catch (err: any) {
    dbState.status = 'error'
    dbState.error = err?.message ?? String(err)
  }
}

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
