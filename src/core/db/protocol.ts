/** Messages between the main thread (SqliteClient) and sqlite.worker.ts. */
export type Bind = (string | number | null | Uint8Array)[] | Record<string, string | number | null | Uint8Array>

export type Engine = 'opfs' | 'memory'

export interface OpenResult {
  engine: Engine
  sqliteVersion: string
  file: string
}

export interface Stmt {
  sql: string
  bind?: Bind
}

export type Request =
  | { op: 'open'; name: string }
  | { op: 'exec'; sql: string; bind?: Bind }
  | { op: 'batch'; stmts: Stmt[] }
  | { op: 'export' }
  | { op: 'import'; bytes: Uint8Array }
  | { op: 'close' }

export type Envelope = Request & { id: number }

export type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

export interface ExecResult<T = Record<string, unknown>> {
  rows: T[]
  changes: number
}
