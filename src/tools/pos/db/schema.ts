import type { Migration } from '@/core/db/migrate'

/**
 * Which table changes mark which sync "entity" as changed. An entity is what travels between
 * devices as one unit (e.g. a sale WITH its lines and payments).
 */
export const SYNC_TRIGGERS: { table: string; entity: string; idCol: string }[] = [
  { table: 'shop', entity: 'shop', idCol: 'id' },
  { table: 'setting', entity: 'setting', idCol: 'key' },
  { table: 'category', entity: 'category', idCol: 'id' },
  { table: 'modifier_group', entity: 'modgroup', idCol: 'id' },
  { table: 'modifier_option', entity: 'modgroup', idCol: 'group_id' },
  { table: 'item', entity: 'item', idCol: 'id' },
  { table: 'item_modifier_group', entity: 'item', idCol: 'item_id' },
  { table: 'customer', entity: 'customer', idCol: 'id' },
  { table: 'sale', entity: 'sale', idCol: 'id' },
  { table: 'sale_line', entity: 'sale', idCol: 'sale_id' },
  { table: 'payment', entity: 'sale', idCol: 'sale_id' },
  { table: 'customer_ledger', entity: 'ledger', idCol: 'id' },
  { table: 'stock_move', entity: 'stock', idCol: 'id' },
  { table: 'day_close', entity: 'dayclose', idCol: 'business_date' },
]

function syncSchemaSql(): string {
  const now = `CAST(unixepoch('subsec') * 1000 AS INTEGER)`
  // Changes applied FROM other devices must not be recorded again (no echo).
  const notApplying = `(SELECT value FROM _sync_state WHERE key = 'applying') IS NOT '1'`
  const triggers = SYNC_TRIGGERS.flatMap(({ table, entity, idCol }) =>
    (['INSERT', 'UPDATE', 'DELETE'] as const).map((ev) => {
      const ref = ev === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER sync_${table}_${ev.toLowerCase()} AFTER ${ev} ON ${table} WHEN ${notApplying}
BEGIN INSERT OR REPLACE INTO _dirty (entity, id, at) VALUES ('${entity}', ${ref}.${idCol}, ${now}); END;`
    }),
  )
  return `
CREATE TABLE _sync_state (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO _sync_state (key, value) VALUES ('applying', '0');
-- Entities changed on THIS device and not yet uploaded.
CREATE TABLE _dirty (entity TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (entity, id));
-- Change files from other devices already applied to this database.
CREATE TABLE _sync_seen (file_id TEXT PRIMARY KEY, device_id TEXT, applied_at INTEGER NOT NULL);
${triggers.join('\n')}
`
}

/**
 * Kitroid POS schema.
 * Conventions:
 *  - ids are ULIDs (TEXT), timestamps are epoch milliseconds (INTEGER)
 *  - money is INTEGER minor units of the sale/shop currency (riel, or USD cents)
 *  - sales are never rewritten once PAID/CLOSED: a refund/void is a new sale row
 *    pointing to the original via ref_sale_id (audit trail, sync-friendly)
 *  - business_date is the shop's local day 'YYYY-MM-DD' (reports group by it)
 */
export const POS_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial POS schema',
    sql: `
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE shop (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  name_km       TEXT,
  phone         TEXT,
  address       TEXT,
  base_currency TEXT NOT NULL DEFAULT 'KHR' CHECK (base_currency IN ('KHR','USD')),
  show_dual     INTEGER NOT NULL DEFAULT 1,
  khr_per_usd   INTEGER NOT NULL DEFAULT 4100,
  riel_step     INTEGER NOT NULL DEFAULT 100,
  template_id   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE category (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_km    TEXT,
  color      TEXT,
  icon       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE item (
  id          TEXT PRIMARY KEY,
  category_id TEXT REFERENCES category(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  name_km     TEXT,
  sku         TEXT,
  barcode     TEXT,
  price       INTEGER NOT NULL DEFAULT 0,
  cost        INTEGER,
  image_path  TEXT,
  icon        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX item_category ON item(category_id, sort);
CREATE UNIQUE INDEX item_barcode ON item(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE modifier_group (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_km    TEXT,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE modifier_option (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_km     TEXT,
  price_delta INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE item_modifier_group (
  item_id  TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, group_id)
);

-- kind: POS = one ticket per customer; QUICK = one tally per day (as in LomOr Quick Sale)
-- status: DRAFT (being entered) -> PAID (POS) / SUBMITTED (QUICK) -> CLOSED (day closed); VOID
CREATE TABLE sale (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('POS','QUICK')),
  number        TEXT,
  business_date TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('DRAFT','PAID','SUBMITTED','CLOSED','VOID')),
  currency      TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  khr_per_usd   INTEGER NOT NULL,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  discount      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  device_id     TEXT NOT NULL,
  ref_sale_id   TEXT REFERENCES sale(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  closed_at     INTEGER
);
CREATE INDEX sale_date ON sale(business_date, kind, status);

CREATE TABLE sale_line (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  item_id    TEXT REFERENCES item(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,           -- snapshot at time of sale
  qty        REAL NOT NULL,
  unit_price INTEGER NOT NULL,        -- incl. modifier deltas
  modifiers  TEXT,                    -- JSON snapshot
  line_total INTEGER NOT NULL,        -- riel lines rounded per line
  group_no   INTEGER,                 -- Quick Sale promo basket
  internal   INTEGER NOT NULL DEFAULT 0, -- free give-away / staff use
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sale_line_sale ON sale_line(sale_id);
CREATE INDEX sale_line_item ON sale_line(item_id);

CREATE TABLE payment (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('CASH','KHQR','CARD','OTHER')),
  currency   TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  amount     INTEGER NOT NULL,
  tendered   INTEGER,
  change_due INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX payment_sale ON payment(sale_id);

-- Frozen totals written when a day is closed: weekly/monthly reports sum these rows.
CREATE TABLE day_close (
  business_date TEXT PRIMARY KEY,
  currency      TEXT NOT NULL,
  sale_count    INTEGER NOT NULL,
  item_count    REAL NOT NULL,
  gross         INTEGER NOT NULL,
  discount      INTEGER NOT NULL,
  net           INTEGER NOT NULL,
  cash          INTEGER NOT NULL DEFAULT 0,
  khqr          INTEGER NOT NULL DEFAULT 0,
  other         INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  closed_at     INTEGER NOT NULL
);

CREATE TABLE backup_log (
  id         TEXT PRIMARY KEY,
  target     TEXT NOT NULL CHECK (target IN ('DRIVE','FOLDER','DOWNLOAD')),
  status     TEXT NOT NULL CHECK (status IN ('OK','ERROR')),
  bytes      INTEGER,
  file_name  TEXT,
  remote_id  TEXT,
  error      TEXT,
  created_at INTEGER NOT NULL
);
`,
  },
  {
    version: 2,
    description: 'Receipt settings, KHQR image, void reason, draft lookup index',
    sql: `
ALTER TABLE shop ADD COLUMN receipt_header TEXT;
ALTER TABLE shop ADD COLUMN receipt_footer TEXT;
ALTER TABLE shop ADD COLUMN khqr_image TEXT;
ALTER TABLE shop ADD COLUMN logo_image TEXT;
ALTER TABLE shop ADD COLUMN paper_mm INTEGER NOT NULL DEFAULT 80;
ALTER TABLE sale ADD COLUMN void_reason TEXT;
ALTER TABLE day_close ADD COLUMN quick INTEGER NOT NULL DEFAULT 0;
ALTER TABLE day_close ADD COLUMN internal_items REAL NOT NULL DEFAULT 0;
CREATE INDEX sale_kind_status ON sale(kind, status, device_id);
`,
  },
  {
    version: 3,
    description: 'Stock, customers & debts, parked tickets, pay-later method',
    sql: `
-- payment.method gains DEBT (pay later). SQLite cannot change a CHECK, so rebuild the table.
CREATE TABLE payment_new (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('CASH','KHQR','CARD','OTHER','DEBT')),
  currency   TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  amount     INTEGER NOT NULL,
  tendered   INTEGER,
  change_due INTEGER,
  created_at INTEGER NOT NULL
);
INSERT INTO payment_new (id, sale_id, method, currency, amount, tendered, change_due, created_at)
  SELECT id, sale_id, method, currency, amount, tendered, change_due, created_at FROM payment;
DROP TABLE payment;
ALTER TABLE payment_new RENAME TO payment;
CREATE INDEX payment_sale ON payment(sale_id);

CREATE TABLE customer (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  note       TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX customer_name ON customer(name);

-- Customer account: CHARGE = they owe more (pay-later sale or manual), PAYMENT = they paid back.
-- Balance = charges - payments; charges of VOID sales are ignored.
CREATE TABLE customer_ledger (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('CHARGE','PAYMENT')),
  sale_id       TEXT REFERENCES sale(id) ON DELETE SET NULL,
  method        TEXT CHECK (method IN ('CASH','KHQR','CARD','OTHER')),
  currency      TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  khr_per_usd   INTEGER NOT NULL,
  amount        INTEGER NOT NULL,
  note          TEXT,
  business_date TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX customer_ledger_customer ON customer_ledger(customer_id, created_at);
CREATE INDEX customer_ledger_date ON customer_ledger(business_date, kind);

ALTER TABLE sale ADD COLUMN customer_id TEXT REFERENCES customer(id);
ALTER TABLE sale ADD COLUMN parked_label TEXT;

-- Stock: on hand = SUM(stock_move.qty) - items sold (computed, so voids restore stock automatically).
ALTER TABLE item ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE item ADD COLUMN low_stock REAL;
CREATE TABLE stock_move (
  id            TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('RECEIVE','ADJUST','WASTE')),
  qty           REAL NOT NULL,
  unit_cost     INTEGER,
  note          TEXT,
  business_date TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX stock_move_item ON stock_move(item_id, created_at);

ALTER TABLE day_close ADD COLUMN debt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE day_close ADD COLUMN collected INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 4,
    description: 'Multi-device sync: change tracking triggers',
    sql: syncSchemaSql(),
  },
]
