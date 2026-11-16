/// <reference types="@unplugin-pwa/core/client" />

interface ImportMetaEnv {
  /** Google OAuth Web client ID for Drive backup (set in GitHub Actions / .env). Optional. */
  readonly PUBLIC_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
