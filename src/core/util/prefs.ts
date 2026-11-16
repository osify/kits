/**
 * Small per-device UI preferences (language, theme, last tab). Business data never
 * goes here; it lives in each tool's SQLite database. Storage can be blocked
 * (private mode, previews), so every access is guarded and the app works without it.
 */
const PREFIX = 'kitroid.'

export const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(PREFIX + key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(PREFIX + key, value)
    } catch {
      /* storage unavailable: preference just won't be remembered */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
  },
}
