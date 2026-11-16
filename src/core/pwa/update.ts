import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker registration with a user-controlled update.
 * A new version NEVER reloads the page by itself (that could interrupt a sale);
 * the app shows a banner and the user taps "Update" when ready.
 */
export const updateReady = ref(false)
export const offlineReady = ref(false)

let doUpdate: (() => Promise<void>) | null = null

export function initPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  doUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady.value = true
    },
    onOfflineReady() {
      offlineReady.value = true
    },
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
}

export function applyUpdate() {
  updateReady.value = false
  return doUpdate?.()
}
