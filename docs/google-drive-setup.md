# Google Drive backup: one-time setup (Kitroid owner)

Users back up to **their own** Google Drive. Kitroid needs only a public **OAuth Web client ID**.
There is no client secret, no server, and Kitroid never receives user data.

## 1. Google Cloud project
1. Go to https://console.cloud.google.com/ and create a project, e.g. `kitroid-web`.
2. **APIs & Services → Library**: enable **Google Drive API**.

## 2. OAuth consent screen (Google Auth Platform)
- User type: **External**.
- App name: `Kitroid`, support email, logo (optional).
- App domain: home page `https://kitroid.com`, privacy policy `https://kitroid.com/privacy/`,
  terms `https://kitroid.com/terms/` (pages to publish before going to production).
- Authorized domain: `kitroid.com` (verify ownership in Google Search Console).
- Scopes: add only `https://www.googleapis.com/auth/drive.file` (non-sensitive, so no security audit).
- **Publish the app** (status "In production"). In "Testing" mode only listed test users can sign in
  and their access expires after 7 days.

## 3. OAuth client ID
**Credentials → Create credentials → OAuth client ID → Web application**
- Authorized JavaScript origins:
  - `https://kitroid.com`
  - `http://localhost:4321` (local development)
- No redirect URIs needed (the token flow uses a popup).

Copy the client ID (`xxxxxxxx.apps.googleusercontent.com`).

## 4. Give it to the build
- GitHub repo → **Settings → Secrets and variables → Actions → Variables** →
  `PUBLIC_GOOGLE_CLIENT_ID` = the client ID. The deploy workflow passes it to the build.
- Local development: create `.env` with `PUBLIC_GOOGLE_CLIENT_ID=...` (it is git-ignored).

The client ID is public by design (it is visible in the page). Without it, the Backup screen hides
Google Drive and offers the folder and download backups only.

## What users see
- Backup → **Connect Google Drive** → Google consent popup ("Kitroid wants to see, edit, create
  and delete only the specific Google Drive files you use with this app").
- Files: `My Drive / Kitroid / POS / <shop name> / kitroid-pos-YYYYMMDD-HHmm.zip`.
- Kitroid keeps the newest 30 backups plus one per month for the last 12 months.
- Browser-only sign-in gives a ~1 hour token and no refresh token, so automatic Drive backups run
  while that token is valid; afterwards a single tap on **Back up now** renews it.
