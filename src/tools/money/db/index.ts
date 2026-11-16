import { reactive } from 'vue'
import { SqliteClient } from '@/core/db/client'
import { migrate } from '@/core/db/migrate'
import { tryLock, takeOver, type TabLock } from '@/core/db/tabLock'
import type { Engine } from '@/core/db/protocol'
import { prefs } from '@/core/util/prefs'
import { ulid } from '@/core/util/id'
import { MONEY_MIGRATIONS } from './schema'

/** The Income & Expense database: its own SQLite file and storage pool, one tab at a time. */
const DB_NAME = 'money'
export const db = new SqliteClient(DB_NAME)

export const dbState = reactive({
  status: 'idle' as 'idle' | 'opening' | 'ready' | 'busy' | 'moved' | 'error',
  engine: null as Engine | null,
  schemaVersion: 0,
  deviceId: '',
  error: '',
})

let lock: TabLock | null = null

async function onTakeover() {
  await db.close()
  dbState.status = 'moved'
}

async function afterLock() {
  const info = await db.open()
  dbState.engine = info.engine
  dbState.schemaVersion = await migrate(db, MONEY_MIGRATIONS)
  let id = prefs.get('device_id')
  if (!id) {
    id = ulid()
    prefs.set('device_id', id)
  }
  dbState.deviceId = id
  dbState.status = 'ready'
}

export async function openMoneyDb() {
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
