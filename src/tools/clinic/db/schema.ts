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
  {
    version: 2,
    description: 'Doctors (weekly hours), rooms, appointments; doctor and room on visits',
    sql: `
CREATE TABLE doctor (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  title       TEXT,                    -- specialty, e.g. Pediatrics
  license     TEXT,
  phone       TEXT,
  color       TEXT NOT NULL,
  hours       TEXT NOT NULL DEFAULT '{}', -- weekly hours JSON: {"1":[["08:00","12:00"],["14:00","17:00"]]}, 0 = Sunday
  slot_min    INTEGER NOT NULL DEFAULT 15,
  room_id     TEXT,                    -- usual room
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE room (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Booked visits. Check-in turns a booking into a visit in the day's queue (visit_id).
CREATE TABLE appointment (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  doctor_id   TEXT,
  room_id     TEXT,
  date        TEXT NOT NULL,
  start       TEXT NOT NULL,           -- 'HH:MM' local
  minutes     INTEGER NOT NULL,
  reason      TEXT,
  note        TEXT,
  status      TEXT NOT NULL CHECK (status IN ('BOOKED','ARRIVED','CANCELLED','NO_SHOW')),
  visit_id    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX appointment_day ON appointment(date, start);
CREATE INDEX appointment_patient ON appointment(patient_id, date);

ALTER TABLE visit ADD COLUMN doctor_id TEXT;
ALTER TABLE visit ADD COLUMN room_id TEXT;
`,
  },
]
