import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Income & Expense ("money") database. Same conventions as POS:
 * ULID ids, epoch-ms timestamps, money as INTEGER minor units of the ACCOUNT's currency,
 * each transaction snapshots the KHR/USD rate used for reports.
 */
export const MONEY_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Accounts, categories, transactions',
    sql: `
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Where money is kept: cash drawer, bank account, KHQR wallet…
CREATE TABLE account (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'CASH' CHECK (kind IN ('CASH','BANK','WALLET','OTHER')),
  currency   TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  opening    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE category (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('IN','OUT')),
  name       TEXT NOT NULL,
  name_km    TEXT,
  icon       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- kind IN = money received, OUT = money spent, MOVE = transfer between accounts
-- (amount leaves account_id; to_amount arrives in to_account_id, possibly another currency).
CREATE TABLE txn (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('IN','OUT','MOVE')),
  date          TEXT NOT NULL,
  account_id    TEXT NOT NULL REFERENCES account(id),
  to_account_id TEXT REFERENCES account(id),
  category_id   TEXT REFERENCES category(id) ON DELETE SET NULL,
  amount        INTEGER NOT NULL,
  to_amount     INTEGER,
  khr_per_usd   INTEGER NOT NULL,
  note          TEXT,
  photo         TEXT,
  device_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX txn_date ON txn(date);
CREATE INDEX txn_account ON txn(account_id);
CREATE INDEX txn_to_account ON txn(to_account_id);
CREATE INDEX txn_category ON txn(category_id);
`,
  },
]
