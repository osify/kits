/// <reference lib="webworker" />
/**
 * SQLite (WebAssembly) running in a dedicated worker.
 *
 * Storage: the "opfs-sahpool" VFS keeps the database as a real file in the browser's
 * Origin Private File System. Unlike the default "opfs" VFS it does NOT need
 * COOP/COEP headers, which matters because GitHub Pages cannot send custom headers.
 *
 * Fallback: if OPFS is unavailable (old browser, some private modes) the database
 * runs in memory and a full snapshot is saved to IndexedDB after every write.
 *
 * All requests are processed strictly one at a time (a promise queue), so a backup
 * export never sees a half-finished write.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Envelope, Reply, Request, OpenResult, ExecResult } from './protocol'

declare const self: DedicatedWorkerGlobalScope

/**
 * The SAH-pool VFS holds exclusive handles on its WHOLE directory, so every tool gets its own
 * pool directory; otherwise two tools open in two tabs would block each other.
 * POS keeps the original names so existing shops keep their data.
 */
const poolFor = (name: string) =>
  name === 'pos' ? { name: 'kitroid-sahpool', directory: '.kitroid' } : { name: `kitroid-sahpool-${name}`, directory: `.kitroid-${name}` }

let sqlite3: any = null
let pool: any = null
let db: any = null
let engine: OpenResult['engine'] = 'memory'
let file = ''
let dbName = ''

// ── IndexedDB snapshot store (memory fallback only) ────────────────────────
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kitroid-fallback', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('db')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const r = d.transaction('db').objectStore('db').get(key)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction('db', 'readwrite')
    tx.objectStore('db').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
async function snapshotIfMemory() {
  if (engine === 'memory' && db) await idbPut(dbName, sqlite3.capi.sqlite3_js_db_export(db))
}

// ── helpers ───────────────────────────────────────────────────────────────
function isSqliteFile(bytes: Uint8Array) {
  const header = 'SQLite format 3\u0000'
  if (bytes.byteLength < 100) return false
  for (let i = 0; i < header.length; i++) if (bytes[i] !== header.charCodeAt(i)) return false
  return true
}

function loadIntoMemory(bytes: Uint8Array) {
  const capi = sqlite3.capi
  db = new sqlite3.oo1.DB(':memory:', 'c')
  const p = sqlite3.wasm.allocFromTypedArray(bytes)
  const rc = capi.sqlite3_deserialize(
    db.pointer,
    'main',
    p,
    bytes.byteLength,
    bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
  )
  db.checkRc(rc)
}

function afterOpen() {
  db.exec('PRAGMA foreign_keys = ON;')
}

async function open(name: string): Promise<OpenResult> {
  if (!sqlite3) sqlite3 = await sqlite3InitModule()
  dbName = name
  file = `/${name}.sqlite3`
  try {
    if (!pool) {
      pool = await sqlite3.installOpfsSAHPoolVfs({
        ...poolFor(name),
        initialCapacity: 6,
        preserveOnInitFailure: true,
      })
    } else if (pool.isPaused()) {
      await pool.unpauseVfs()
    }
    db = new pool.OpfsSAHPoolDb(file)
    engine = 'opfs'
  } catch (err) {
    console.warn('[kitroid-db] OPFS unavailable, using in-memory + IndexedDB snapshot', err)
    pool = null
    const saved = await idbGet(name).catch(() => undefined)
    if (saved && isSqliteFile(saved)) loadIntoMemory(saved)
    else db = new sqlite3.oo1.DB(':memory:', 'c')
    engine = 'memory'
  }
  afterOpen()
  return { engine, sqliteVersion: sqlite3.version.libVersion, file }
}

function requireDb() {
  if (!db) throw new Error('Database is not open')
  return db
}

function isRead(sql: string) {
  return /^\s*(select|pragma\s+\w+\s*;?\s*$|with\b[\s\S]*\bselect\b)/i.test(sql) && !/\b(insert|update|delete|create|drop|alter|replace)\b/i.test(sql)
}

async function exec(sql: string, bind?: any): Promise<ExecResult> {
  const d = requireDb()
  const rows = d.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
  const changes = d.changes()
  if (!isRead(sql)) await snapshotIfMemory()
  return { rows, changes }
}

async function batch(stmts: { sql: string; bind?: any }[]): Promise<number> {
  const d = requireDb()
  let changes = 0
  d.transaction(() => {
    for (const s of stmts) {
      d.exec({ sql: s.sql, bind: s.bind })
      changes += d.changes()
    }
  })
  await snapshotIfMemory()
  return changes
}

function exportDb(): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(requireDb())
}

async function importDb(bytes: Uint8Array): Promise<OpenResult> {
  if (!isSqliteFile(bytes)) throw new Error('Not a SQLite database file')
  if (engine === 'opfs' && pool) {
    db?.close()
    db = null
    await pool.importDb(file, bytes)
    db = new pool.OpfsSAHPoolDb(file)
  } else {
    db?.close()
    loadIntoMemory(bytes)
    await snapshotIfMemory()
  }
  afterOpen()
  return { engine, sqliteVersion: sqlite3.version.libVersion, file }
}

function close() {
  db?.close()
  db = null
  // Release the OPFS file handles so another tab can open the database.
  if (pool && !pool.isPaused()) pool.pauseVfs()
}

async function handle(req: Request): Promise<{ result: unknown; transfer?: Transferable[] }> {
  switch (req.op) {
    case 'open':
      return { result: await open(req.name) }
    case 'exec':
      return { result: await exec(req.sql, req.bind) }
    case 'batch':
      return { result: await batch(req.stmts) }
    case 'export': {
      const bytes = exportDb()
      return { result: bytes, transfer: [bytes.buffer] }
    }
    case 'import':
      return { result: await importDb(req.bytes) }
    case 'close':
      close()
      return { result: true }
  }
}

let queue: Promise<void> = Promise.resolve()
self.onmessage = (e: MessageEvent<Envelope>) => {
  const { id, ...req } = e.data
  queue = queue.then(async () => {
    let reply: Reply
    let transfer: Transferable[] = []
    try {
      const out = await handle(req as Request)
      reply = { id, ok: true, result: out.result }
      transfer = out.transfer ?? []
    } catch (err: any) {
      reply = { id, ok: false, error: err?.message ?? String(err) }
    }
    self.postMessage(reply, transfer)
  })
}
