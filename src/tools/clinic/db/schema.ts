import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Clinic (doctor check-up) database. Patient records are private medical data: they stay
 * on the clinic's device and in its own (optionally encrypted) Drive backups. ULID ids, epoch-ms
 * timestamps, money in minor units (riel, or USD cents). Forward-only migrations.
 */
export const CLINIC_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Patients, price list, visits, fees, prescriptions',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE patient (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,    -- P-0001: shown on papers and given to pharmacies instead of the name
  name        TEXT NOT NULL,
  sex         TEXT CHECK (sex IN ('M','F')),
  birth_date  TEXT,
  phone       TEXT,
  address     TEXT,
  allergies   TEXT,
  conditions  TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX patient_name ON patient(name);
CREATE INDEX patient_phone ON patient(phone);

-- Price list: consultations, procedures, tests, medicines.
CREATE TABLE service (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('SERVICE','MEDICINE')),
  price       INTEGER NOT NULL,
  unit        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE visit (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  queue_no      INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('WAITING','DONE')),
  complaint     TEXT,
  bp_sys        INTEGER,
  bp_dia        INTEGER,
  pulse         INTEGER,
  temp          REAL,
  weight        REAL,
  spo2          INTEGER,
  glucose       INTEGER,
  exam          TEXT,
  diagnosis     TEXT,
  plan          TEXT,
  followup_date TEXT,
  discount      INTEGER NOT NULL DEFAULT 0,
  paid          INTEGER NOT NULL DEFAULT 0,        -- amount received
  pay_method    TEXT,
  rx_id         TEXT,                              -- id printed in the prescription code
  done_at       INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX visit_date ON visit(date, queue_no);
CREATE INDEX visit_patient ON visit(patient_id, date);

CREATE TABLE visit_line (
  id          TEXT PRIMARY KEY,
  visit_id    TEXT NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  service_id  TEXT,
  name        TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  price       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE rx_item (
  id          TEXT PRIMARY KEY,
  visit_id    TEXT NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  dose        TEXT,
  times       INTEGER,          -- times per day
  days        INTEGER,
  qty         REAL,
  unit        TEXT,
  note        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
`,
  },
]
