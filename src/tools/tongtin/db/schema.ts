import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Tong Tin (savings circle, តុងទីន) database. ULID ids, epoch-ms timestamps,
 * money in minor units (riel, or USD cents). Forward-only migrations: never edit a released one.
 */
export const TONGTIN_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Circles, members, rounds, payments',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

-- One savings circle. amount = what one hand pays each round.
CREATE TABLE circle (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  amount      INTEGER NOT NULL,
  start_date  TEXT NOT NULL,                 -- 'YYYY-MM-DD', date of round 1
  every       TEXT NOT NULL CHECK (every IN ('MONTH','HALF_MONTH','WEEK','DAY')),
  mode        TEXT NOT NULL CHECK (mode IN ('BID','ORDER')),
  head_first  INTEGER NOT NULL DEFAULT 1,    -- the organiser (head) takes round 1 with no bid
  head_id     TEXT,                          -- member who is the head
  note        TEXT,
  closed_at   INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- One row per hand (a person with two hands is added twice).
CREATE TABLE member (
  id          TEXT PRIMARY KEY,
  circle_id   TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  note        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX member_circle ON member(circle_id, sort);

-- A round that has been drawn: who took the pot and the bid (discount per hand).
CREATE TABLE round (
  id          TEXT PRIMARY KEY,
  circle_id   TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  no          INTEGER NOT NULL,
  date        TEXT NOT NULL,
  winner_id   TEXT NOT NULL REFERENCES member(id),
  bid         INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (circle_id, no)
);

-- Who has paid their share for a round.
CREATE TABLE payment (
  id          TEXT PRIMARY KEY,
  round_id    TEXT NOT NULL REFERENCES round(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  paid_at     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (round_id, member_id)
);
`,
  },
]
