import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Health (personal & family) database. Private: it stays on the device and in the
 * user's own Drive backups. ULID ids, epoch-ms timestamps. Forward-only migrations.
 */
export const HEALTH_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Family, readings, medicines, doses, appointments, records',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE person (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  relation    TEXT,                -- me, child, mother… (free text)
  birth_date  TEXT,                -- 'YYYY-MM-DD'
  sex         TEXT CHECK (sex IN ('M','F')),
  blood_type  TEXT,
  allergies   TEXT,
  conditions  TEXT,
  note        TEXT,
  photo       TEXT,
  color       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- One measurement. BP: v1 = systolic, v2 = diastolic. Glucose stored in mg/dL.
CREATE TABLE reading (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('BP','PULSE','GLUCOSE','WEIGHT','HEIGHT','TEMP','SPO2')),
  v1          REAL NOT NULL,
  v2          REAL,
  context     TEXT,                -- glucose: FASTING / AFTER_MEAL / RANDOM
  taken_at    INTEGER NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX reading_person ON reading(person_id, kind, taken_at);

-- A medicine taken at fixed times each day between start and end.
CREATE TABLE medicine (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  dose        TEXT,                -- "1 tablet", "5 ml"
  times       TEXT NOT NULL,       -- "08:00,20:00"
  start_date  TEXT NOT NULL,
  end_date    TEXT,                -- null = ongoing
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- A dose marked as taken.
CREATE TABLE dose (
  id           TEXT PRIMARY KEY,
  medicine_id  TEXT NOT NULL REFERENCES medicine(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  time         TEXT NOT NULL,
  taken_at     INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (medicine_id, date, time)
);

CREATE TABLE appointment (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  time        TEXT,
  place       TEXT,
  doctor      TEXT,
  reason      TEXT,
  note        TEXT,
  done_at     INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX appointment_date ON appointment(done_at, date);

-- Vaccines, doctor visits, lab results, prescriptions, notes (with an optional photo and next due date).
CREATE TABLE record (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('VACCINE','VISIT','LAB','RX','NOTE')),
  date        TEXT NOT NULL,
  title       TEXT NOT NULL,
  note        TEXT,
  photo       TEXT,
  next_due    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX record_person ON record(person_id, date);
`,
  },
]
