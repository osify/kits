# Kitroid

Free, offline-first business tools for Cambodian small and medium businesses: **kitroid.com**.

- Runs entirely in the browser and works offline after the first visit. It can be installed like an app.
- Data stays on the user's own device in SQLite (WebAssembly) stored in the browser's private file system.
- Optional backup to the user's own Google Drive.
- Hosted as a static site on GitHub Pages: no server, no database to set up.

First tool: **Kitroid POS** (`/pos/`) with POS and Quick Sales modes.

```bash
npm install
npm run dev       # local development
npm run build     # build to dist/
npm run preview   # preview the production build (service worker on)
```

See [CLAUDE.md](CLAUDE.md) for the architecture, constraints and roadmap.
