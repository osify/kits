import type { Migration } from '@/core/db/migrate'

/** Kitroid Customers (CRM) database. ULID ids, epoch-ms timestamps, money in minor units. */
export const CRM_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Customers, activity, follow-ups, debts',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE customer (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  telegram   TEXT,
  address    TEXT,
  tags       TEXT,            -- comma separated, e.g. "VIP,Wholesale"
  birthday   TEXT,            -- 'MM-DD' or 'YYYY-MM-DD'
  note       TEXT,
  photo      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX customer_name ON customer(name);
CREATE INDEX customer_phone ON customer(phone);

-- What happened: call, visit, message, sale, note
CREATE TABLE activity (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('CALL','VISIT','MESSAGE','SALE','NOTE')),
  date        TEXT NOT NULL,
  note        TEXT,
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX activity_customer ON activity(customer_id, date);

-- Something to do for a customer by a date
CREATE TABLE followup (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  due         TEXT NOT NULL,
  note        TEXT,
  done_at     INTEGER,
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX followup_due ON followup(done_at, due);

-- Debts: CHARGE = customer owes more, PAYMENT = paid back. Balances are kept per currency.
CREATE TABLE ledger (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('CHARGE','PAYMENT')),
  currency    TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  amount      INTEGER NOT NULL,
  date        TEXT NOT NULL,
  note        TEXT,
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX ledger_customer ON ledger(customer_id, date);
`,
  },
]
