import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Invoice database: clients, saved items, quotes and invoices, payments.
 * ULID ids, epoch-ms timestamps, money in minor units of the document's currency
 * (riel, or USD cents). Each document snapshots its client details, currency, KHR/USD rate
 * and VAT rate, so later edits never change a document already sent. Forward-only migrations.
 */
export const INVOICE_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Clients, items, quotes, invoices, payments',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE client (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  company     TEXT,
  vat_tin     TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX client_name ON client(name);

CREATE TABLE item (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT,
  price       INTEGER NOT NULL,          -- minor units of the item's currency
  currency    TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE doc (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('QUOTE','INVOICE')),
  number         TEXT,                   -- QT-2026-0001 at creation; INV-2026-0001 when issued (drafts: NULL)
  status         TEXT NOT NULL CHECK (status IN ('DRAFT','SENT','ACCEPTED','DECLINED','ISSUED','VOID')),
  client_id      TEXT,
  client_name    TEXT,
  client_company TEXT,
  client_vat_tin TEXT,
  client_address TEXT,
  client_phone   TEXT,
  client_email   TEXT,
  date           TEXT NOT NULL,          -- issue date
  due_date       TEXT,                   -- invoice: pay by; quote: valid until
  currency       TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  khr_per_usd    INTEGER NOT NULL,
  vat_rate       INTEGER NOT NULL DEFAULT 0,   -- percent: 0 or 10
  discount       INTEGER NOT NULL DEFAULT 0,
  subtotal       INTEGER NOT NULL DEFAULT 0,   -- kept up to date by recalc()
  vat            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  terms          TEXT,
  from_id        TEXT,                   -- invoice made from this quote
  issued_at      INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX doc_kind_date ON doc(kind, date);
CREATE INDEX doc_client ON doc(client_id);

CREATE TABLE doc_line (
  id          TEXT PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES doc(id) ON DELETE CASCADE,
  item_id     TEXT,
  name        TEXT NOT NULL,
  detail      TEXT,
  unit        TEXT,
  qty         REAL NOT NULL DEFAULT 1,
  price       INTEGER NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX doc_line_doc ON doc_line(doc_id, sort);

CREATE TABLE payment (
  id          TEXT PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES doc(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  amount      INTEGER NOT NULL,          -- minor units of the document's currency
  method      TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX payment_doc ON payment(doc_id);
CREATE INDEX payment_date ON payment(date);
`,
  },
]
