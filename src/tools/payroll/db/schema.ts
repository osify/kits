import type { Migration } from '@/core/db/migrate'

/**
 * Kitroid Payroll database: staff and one payroll per month (tax on salary, NSSF, fringe benefit
 * tax). ULID ids, epoch-ms timestamps. Salary inputs are minor units of the staff member's currency
 * (riel, or USD cents); every computed tax amount is in riel, at the month's exchange rate.
 * Each month's line snapshots the staff details, so later edits never change a closed month.
 * Forward-only migrations.
 */
export const PAYROLL_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Staff, monthly payroll runs and lines',
    sql: `
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE staff (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,      -- E-001
  name          TEXT NOT NULL,
  name_latin    TEXT,
  sex           TEXT CHECK (sex IN ('M','F')),
  position      TEXT,
  nationality   TEXT,
  id_no         TEXT,                      -- national ID / passport
  nssf_no       TEXT,
  phone         TEXT,
  bank          TEXT,                      -- account for the salary transfer
  resident      INTEGER NOT NULL DEFAULT 1,
  children      INTEGER NOT NULL DEFAULT 0,
  spouse        INTEGER NOT NULL DEFAULT 0,
  nssf_covered  INTEGER NOT NULL DEFAULT 1,
  salary        INTEGER NOT NULL,          -- monthly, minor units of currency
  currency      TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  start_date    TEXT,
  end_date      TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE run (
  month        TEXT PRIMARY KEY,           -- 'YYYY-MM'
  khr_per_usd  INTEGER NOT NULL,           -- rate used for dollar salaries this month
  status       TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  closed_at    INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE run_line (
  id              TEXT PRIMARY KEY,
  month           TEXT NOT NULL REFERENCES run(month) ON DELETE CASCADE,
  staff_id        TEXT NOT NULL,
  -- snapshot of the staff member this month
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  position        TEXT,
  nationality     TEXT,
  resident        INTEGER NOT NULL,
  children        INTEGER NOT NULL,
  spouse          INTEGER NOT NULL,
  nssf_covered    INTEGER NOT NULL,
  currency        TEXT NOT NULL CHECK (currency IN ('KHR','USD')),
  -- inputs (minor units of currency)
  salary          INTEGER NOT NULL,
  bonus           INTEGER NOT NULL DEFAULT 0,
  seniority       INTEGER NOT NULL DEFAULT 0,
  seniority_times INTEGER NOT NULL DEFAULT 2,
  fringe          INTEGER NOT NULL DEFAULT 0,
  pension_fund    INTEGER NOT NULL DEFAULT 0,
  deduction       INTEGER NOT NULL DEFAULT 0,  -- advance repaid, absence… (after tax)
  note            TEXT,
  -- results in riel, kept up to date by computeLine()
  gross_khr       INTEGER NOT NULL DEFAULT 0,  -- salary + bonus + seniority
  taxable_khr     INTEGER NOT NULL DEFAULT 0,  -- gross − exempt seniority
  pension_khr     INTEGER NOT NULL DEFAULT 0,  -- employee NSSF pension (off the base)
  allowance_khr   INTEGER NOT NULL DEFAULT 0,
  base_khr        INTEGER NOT NULL DEFAULT 0,
  tax_khr         INTEGER NOT NULL DEFAULT 0,
  nssf_risk_khr   INTEGER NOT NULL DEFAULT 0,
  nssf_health_khr INTEGER NOT NULL DEFAULT 0,
  nssf_pension_er_khr INTEGER NOT NULL DEFAULT 0,
  fringe_khr      INTEGER NOT NULL DEFAULT 0,  -- fringe + pension fund above 10%
  fbt_khr         INTEGER NOT NULL DEFAULT 0,
  net_khr         INTEGER NOT NULL DEFAULT 0,  -- paid to the employee (after the deduction)
  cost_khr        INTEGER NOT NULL DEFAULT 0,  -- employer cost
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (month, staff_id)
);
CREATE INDEX run_line_month ON run_line(month, code);
`,
  },
]
