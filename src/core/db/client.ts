import type { Bind, Envelope, ExecResult, OpenResult, Reply, Request, Stmt } from './protocol'

/**
 * Main-thread handle to one tool's SQLite database (running in sqlite.worker.ts).
 * Every call is async and goes through the worker's queue.
 */
export class SqliteClient {
  /** Called after every successful write (used to know when a backup is due). */
  onWrite: (() => void) | null = null
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  info: OpenResult | null = null

  constructor(readonly name: string) {}

  private start() {
    const w = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module', name: `kitroid-db-${this.name}` })
    w.onmessage = (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id)
      if (!p) return
      this.pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.result)
      else p.reject(new Error(e.data.error))
    }
    w.onerror = (e) => {
      const err = new Error(e.message || 'Database worker crashed')
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
    }
    this.worker = w
  }

  private call<T>(req: Request, transfer: Transferable[] = []): Promise<T> {
    if (!this.worker) this.start()
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ id, ...req } as Envelope, transfer)
    })
  }

  async open(): Promise<OpenResult> {
    this.info = await this.call<OpenResult>({ op: 'open', name: this.name })
    return this.info
  }

  /** Run one statement; returns rows for SELECTs. */
  async query<T = Record<string, unknown>>(sql: string, bind?: Bind): Promise<T[]> {
    const r = await this.call<ExecResult<T>>({ op: 'exec', sql, bind })
    return r.rows
  }

  async get<T = Record<string, unknown>>(sql: string, bind?: Bind): Promise<T | undefined> {
    return (await this.query<T>(sql, bind))[0]
  }

  /** Run one write statement; returns the number of changed rows. */
  async run(sql: string, bind?: Bind): Promise<number> {
    const r = await this.call<ExecResult>({ op: 'exec', sql, bind })
    if (r.changes) this.onWrite?.()
    return r.changes
  }

  /** Run several statements in ONE transaction (all or nothing). */
  async batch(stmts: Stmt[]): Promise<number> {
    const n = await this.call<number>({ op: 'batch', stmts })
    if (n) this.onWrite?.()
    return n
  }

  /** The whole database as a .sqlite file (for backup / download). */
  exportBytes(): Promise<Uint8Array> {
    return this.call<Uint8Array>({ op: 'export' })
  }

  /** Replace the whole database with a .sqlite file (restore). */
  async importBytes(bytes: Uint8Array): Promise<OpenResult> {
    this.info = await this.call<OpenResult>({ op: 'import', bytes }, [bytes.buffer as ArrayBuffer])
    return this.info
  }

  /** Close and release the file so another tab can open it. */
  async close() {
    if (!this.worker) return
    try {
      await this.call({ op: 'close' })
    } finally {
      this.worker.terminate()
      this.worker = null
      this.info = null
    }
  }
}
