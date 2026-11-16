import type { SqliteClient } from './client'

export interface Migration {
  version: number
  description: string
  sql: string
}

/**
 * Forward-only schema migrations. Every user's device holds its own database, and an
 * app update reaches everyone at once, so:
 *   - never edit or delete a released migration; add a new one;
 *   - never drop user data; old backups must still restore (they migrate on open).
 */
export async function migrate(db: SqliteClient, migrations: Migration[]): Promise<number> {
  await db.run(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  const row = await db.get<{ value: string }>(`SELECT value FROM _meta WHERE key = 'schema_version'`)
  let current = row ? Number(row.value) : 0
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const latest = sorted.at(-1)?.version ?? 0
  if (current > latest) {
    throw new Error(`This data was saved by a newer version of the app (schema ${current} > ${latest}). Please update the app.`)
  }
  for (const m of sorted) {
    if (m.version <= current) continue
    await db.batch([
      { sql: m.sql },
      {
        sql: `INSERT INTO _meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        bind: [String(m.version)],
      },
    ])
    current = m.version
  }
  return current
}
