# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What Kitroid is

**kitroid.com**: free, offline-first business tools for Cambodian small and medium businesses
(SMEs). The whole site is **static files on GitHub Pages**. There is **no backend, no database server,
no accounts**. Every tool runs in the user's browser and stores data **only on the user's device**
(PC, tablet, phone). Users can optionally back up to **their own Google Drive** with their own Gmail.
Users run the tools at their own risk; Kitroid never receives their data.

| Path | Tool | Status |
|---|---|---|
| `/` (km), `/en/` | Landing page promoting the tools | done |
| `/privacy/`, `/terms/` | Privacy policy and terms (required by Google OAuth) | done (review before launch) |
| `/pos/` | POS + Quick Sales | Phases 0–6 done |
| `/money/` | Income & Expense: accounts (cash/bank/e-wallet, ៛ or $), money in/out/transfer, categories, receipt photos, month view, year report, CSV, Drive/file backup + restore | done (own DB `money`, `src/tools/money/`) |
| `/crm/` | Customers: contacts (phone, Telegram, tags, birthday), follow-ups with today/overdue list, activity log, debts per currency, CSV import/export, backups | done (own DB `crm`, `src/tools/crm/`) |
| `/calc/` | Useful calculators: change in ៛/$, cash-drawer count, VAT, discount, unit price | done (stateless, `src/tools/calc/`) |
| `/finance/` | Financial calculator: loan (annuity / equal principal / flat, true cost incl. fees, schedule, CSV, print), savings, price & profit, break-even, **Salary & NSSF** (GDT Tax on Salary, allowances, FBT, NSSF by month, payslip), **Withholding tax** | done (stateless). **Tax/NSSF rates live in `src/tools/finance/rates.ts` with `CHECKED` date + sources: update there when the law changes** |
| `/tongtin/` | Tong Tin (savings circle): circles with hands, bid or fixed-order rounds, head takes round 1, who paid per round, per-hand totals, planner with each turn's gain/cost and rate per round, backups | done (own DB `tongtin`, `src/tools/tongtin/`; rules in `rules.ts`) |

This is **not** POS-52. POS-52 (`U:\BP\POS-52`, the server-based system used by LomOr & Co) is the
reference for business logic: Quick Sale (`frontends/admin-portal/src/views/sales/QuickSaleView.vue`),
riel rounding (`docs/03-Report/69-Report-Riel-Rounding-100.md`), receipts
(`composables/usePosReceiptPrinter.ts`). Port the logic and UX, not the server architecture.

## Hard constraints (do not break)

1. **Must run on GitHub Pages.** Static output only. No server code, no API routes, no SSR adapter,
   and **no custom HTTP headers** (so no COOP/COEP, no SharedArrayBuffer). Anything needing a server is out.
2. **No data leaves the device** except the user's own explicit Google Drive backup. No analytics,
   no third-party scripts, no CDN fonts (fonts are bundled for offline use). The only exception is
   Google's sign-in script (`accounts.google.com/gsi/client`), loaded on demand when the user taps
   "Connect Google Drive".
7. **Never commit `.license/`** (license signing private key).
3. **Offline after first visit.** Every asset a tool needs must be in the service-worker precache.
4. **Never lose user data.** Schema migrations are forward-only and additive; never edit a released
   migration; old backups must restore and migrate. Never auto-reload the page (could interrupt a sale).
5. **Khmer first.** Every UI string exists in `km` and `en`. Riel amounts shown to people are rounded to
   the 100 ៛ note, and totals are built from rounded lines.
6. **Keep it light.** Target cheap Android phones/tablets. Lazy-load views; avoid heavy deps.

## Stack

- **Astro 7** (static site, pages, landing) + **Vue 3.5** (tools) + **PrimeVue 4.5** (pinned `~4.5.5`,
  with `@primeuix/themes@2`; PrimeVue 5 exists but is not adopted) + **Tailwind CSS 4**
  (`@tailwindcss/vite`, `tailwindcss-primeui`) + vue-i18n 11 + vue-router 5 (hash history) + Pinia.
- **SQLite WASM** (`@sqlite.org/sqlite-wasm`) in a Web Worker using the **`opfs-sahpool` VFS**
  (works without COOP/COEP headers). Fallback: in-memory DB + full snapshot in IndexedDB.
- **PWA**: `@vite-pwa/astro` v2 (`AstroPWAIntegration`, unplugin-pwa). One root service worker,
  `registerType: 'prompt'`, per-tool web manifests in `public/<tool>/manifest.webmanifest`.
- TypeScript ~6.0 (`@astrojs/check` does not support TS 7 yet).

## Layout

```
astro.config.mjs          site config, PWA (precache rules), vite (sqlite-wasm exclude, es workers)
public/CNAME              kitroid.com
public/icons/             logo SVG + generated PNGs (npx pwa-assets-generator --preset minimal-2023 public/icons/kitroid.svg)
public/<tool>/            per-tool static files (manifest, templates JSON)
src/pages/                Astro routes: index (km), en/index, pos/index (mounts the POS SPA)
src/layouts/BaseLayout.astro   head, fonts, global CSS, dark-mode script
src/components/           Landing.astro, shared Vue components (LangToggle, UpdateBanner)
src/core/                 SHARED by all tools
  db/        sqlite.worker.ts (engine), client.ts (SqliteClient RPC), migrate.ts, tabLock.ts, protocol.ts
  i18n/      km.json, en.json, index.ts (vue-i18n), static.ts (tr() for Astro pages)
  pwa/       update.ts (registerSW, update banner state)
  ui/        install.ts (PrimeVue + services + i18n), preset.ts (brand theme)
  util/      money.ts (minor units, riel rounding), id.ts (ULID), storage.ts (persist/quota), prefs.ts
src/tools/<tool>/         one folder per tool: main.ts (createApp + mount), Root.vue, router.ts, views/, db/
src/vue-app.ts            Astro appEntrypoint for Vue islands on Astro pages
```

### Adding a new tool (example: `/finance/`, already built: `src/tools/finance/`)
1. `src/tools/finance/` with `main.ts` mounting a Vue app (reuse `installUi`), own router (hash).
2. `src/pages/finance/index.astro` with `<div id="finance-app">` + `<script>import '../../tools/finance/main'</script>`.
3. `public/finance/manifest.webmanifest` (`start_url`/`scope` = `/finance/`).
4. If it stores data: its own DB name (`new SqliteClient('finance')`), its own migrations, own tab lock.
   Simple calculators that store nothing can be Astro pages with Vue islands (`client:visible`).
5. Add strings to `src/core/i18n/{km,en}.json` and a card on the landing page.

## Data rules (POS)

- Schema: `src/tools/pos/db/schema.ts`. IDs = ULID; timestamps = epoch ms; money = INTEGER minor units
  (riel, or USD cents); each sale snapshots `currency` + `khr_per_usd`.
- Sales are immutable once PAID/CLOSED; refunds/voids are new rows (`ref_sale_id`).
- `business_date` ('YYYY-MM-DD', local) drives reports; `day_close` stores frozen daily totals so
  weekly/monthly summaries stay fast.
- Settings that must survive restore go in the `setting` table. Per-device things (language,
  `device_id`) go in `prefs` (localStorage), never in the DB.
- One tab at a time per DB (Web Locks + BroadcastChannel "Use here" takeover).
- Each tool's DB has its OWN OPFS SAH-pool directory (`poolFor()` in `sqlite.worker.ts`): the pool locks its whole
  directory, so a shared pool would stop two tools running in two tabs. POS keeps `.kitroid`; others use `.kitroid-<name>`.
- Drive helpers live in `src/core/backup/drive.ts` and take a `tool` argument (`My Drive / Kitroid / <tool folder>`).
- New single-database tools get backups from `createToolBackup()` (`src/core/backup/toolBackup.ts`) and the
  shared `<BackupPanel>` screen (`src/components/BackupPanel.vue`); see `src/tools/crm/db/index.ts`.
- Persist every user tap immediately (drafts in the DB), so refresh/close/crash loses nothing.

## Repository

https://github.com/osify/kits (branch `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`).

## Commands

```bash
npm install
npm run dev        # http://localhost:4321  (service worker disabled in dev)
npm run build      # static output in dist/ (includes sw.js)
npm run preview    # serve dist/ (test offline: load once, stop the server, reload)
npm run check      # astro check + vue-tsc (types)
npm test           # sync engine, finance, income & expense, calculators, customers, tax/NSSF, Tong Tin (also runs in CI)
```

Deploy: push to `main` → `.github/workflows/deploy.yml` builds and publishes to GitHub Pages.
DNS for kitroid.com must point to GitHub Pages (apex A records 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153,
`www` CNAME → `<org>.github.io`), and Pages → Custom domain = kitroid.com with HTTPS enforced.

## POS map (where things are)

| Area | Files |
|---|---|
| First run wizard (shop → ready menu → backup, or restore) | `views/WelcomeView.vue`, `components/ShopForm.vue`, `TemplatePicker.vue`, `RestorePanel.vue` |
| Menu & shop (items, categories, add-ons, ready menus, shop/receipt/KHQR) | `views/SetupView.vue`, `components/ItemDialog.vue`, `CategoryDialog.vue`, `AddonGroupDialog.vue`, `ImagePicker.vue` |
| Ready menus (recommended business setups) | `public/pos/templates/index.json` + `<id>.json` (prices in riel; add a file + index entry, no app release needed) |
| POS (cart per device, add-ons, cash KHR/USD with change, KHQR, receipt) | `views/SellView.vue`, `components/PaymentDialog.vue`, `Receipt.vue`, `PrintSheet.vue` |
| Quick Sales (one tally per day, free/give-away, submit) | `views/QuickView.vue` (logic ported from POS-52 `QuickSaleView.vue`) |
| Summary (periods, KPIs, best sellers, daily chart, sales list, void, close/reopen day, Z-report, CSV) | `views/SummaryView.vue`, `db/reports.ts`, `components/DailyBars.vue`, `ZReport.vue` |
| Backup (Drive, PC folder, download, restore, auto-backup, reminder) | `views/BackupView.vue`, `backup/{index,archive,drive,folder}.ts` |
| Data access | `db/{index,schema,shop,catalog,sales,reports}.ts`; stores `stores/{shop,catalog}.ts` |
| Stock (ledger: on hand = moves − sold; voids restore) | `views/StockView.vue`, `db/stock.ts` |
| Customers & debts (pay later, repayments, manual debts) | `views/CustomersView.vue`, `components/CustomerPicker.vue`, `CustomerDialog.vue`, `db/customers.ts` |
| Parked tickets, customer on sale | `components/CartPanel.vue`, `db/sales.ts` (`parkSale`, `resumeParked`, `setSaleCustomer`) |
| Direct thermal printing (ESC/POS raster via Web Bluetooth / Web Serial) | `src/core/print/escpos.ts`, `tools/pos/print/index.ts`, `components/PrinterSettings.vue` |
| Plan / license keys (offline-verified); Free = 50 items on sale (`PLAN_LIMITS`, `ItemLimitBar.vue`, `checkItemLimit`) | `src/core/license/*`, `components/PlanSettings.vue`, `scripts/license/*`, `docs/licensing.md` |
| Item photos | `src/core/files/images.ts` (resize → WebP, SHA-256 names, OPFS `/pos-files/images/`, IndexedDB fallback) |

Backup file = `.zip` with `manifest.json`, `pos.sqlite3`, `images/*`. Restore accepts that zip or a bare `.sqlite`.
Google Drive needs `PUBLIC_GOOGLE_CLIENT_ID` at build time; see `docs/google-drive-setup.md`.

## Roadmap (POS)

| Phase | Scope |
|---|---|
| 0 ✅ | Repo, Pages deploy, PWA shell, SQLite/OPFS, migrations, tab lock, refresh-safe, km/en, landing, disclaimer |
| 1 ✅ | Setup wizard, 5 ready menus (café, buns, rice & noodles, mini-mart, salon), categories, items, add-ons, photos |
| 2 ✅ | POS checkout (cash KHR/USD + change, KHQR image, card/other), Quick Sales tally, receipts 58/80 mm |
| 3 ✅ | Summary (today/yesterday/week/month/last month/custom), close/reopen day, Z-report, void, CSV export |
| 4 ✅ | Google Drive backup + restore, PC-folder auto backup, download/restore file, reminders |
| 5 ✅ | Stock, customers & debts (pay later), parked tickets, direct Bluetooth/USB ESC/POS printing, license keys + feature flags (all free for now) |
| 6 ✅ | Multi-device sync through Google Drive (`sync/engine.ts` + `sync/index.ts`, tested by `npm test`) |

### Multi-device sync (how it works)
- Migration v4 adds triggers on every synced table that record the changed **entity** in `_dirty`
  (entity = sale+lines+payments, item+add-on links, add-on group+options, category, customer, ledger
  entry, stock move, day close, shop, setting). `SYNC_TRIGGERS` in `db/schema.ts` is the list.
- Push: `_dirty` → ops (row + children, or a tombstone if the row is gone) → gzip JSON uploaded to
  `<shop folder>/sync/<ulid>_<device>.json.gz`. POS carts and parked tickets never leave the device.
- Pull: other devices' files not in `_sync_seen` are applied with **last write wins** on the entity's
  marker (`updated_at`, `closed_at`, `created_at`); ties keep the local copy (idempotent). While applying,
  `_sync_state.applying = '1'` mutes the triggers (no echo) and foreign keys are off.
- **Every write must bump `updated_at`** on the entity row (sales: also when lines change). New synced
  tables need: an entry in `ENTITIES` (engine.ts), triggers in a new migration, and a test in `scripts/test-sync.mts`.
- Quick Sales tallies are per device (`getQuickSale` filters by `device_id`); POS numbers get a device
  tag when sync is on. Each device deletes its own change files after 60 days.
- Joining: new device restores the shop's Drive backup (same shop id), then turns sync on.

## Support & paid keys

- Buy Me a Coffee: `SUPPORT_URL` / `MEMBERSHIP_URL` in `src/core/support.ts`; shown on the landing page,
  `<SupportCard>` (`src/components/SupportCard.vue`) in each tool, and `.github/FUNDING.yml`. A link only:
  no Buy Me a Coffee script or widget (no third-party scripts).
- Monthly members get a Pro key: `node scripts/license/issue.mjs --name "Shop" --plan pro --months 1`
  (see `docs/licensing.md`). POS → Menu & shop → Plan shows the membership card above the key box.

## Conventions

- Vue SFCs with `<script setup lang="ts">`; PrimeVue components imported per file (tree-shaking).
- Colors via the `--k-*` tokens in `src/styles/global.css` and Tailwind; dark mode = `.dark` on `<html>`
  (follows the OS).
- Guard every `localStorage` access (use `prefs`), and never block the app if storage is unavailable.
- Khmer copy should be reviewed by a native speaker before release.
- Printed/official documents (receipts, PDF/Excel reports) with Khmer text use **Khmer OS Siemreap**
  (body) and **Khmer OS Muol Light** (titles).
