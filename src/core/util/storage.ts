/**
 * Browser storage health. Data lives on the device, so we ask the browser to mark
 * our storage "persistent" (not evicted under storage pressure) and show the user
 * how much space is used.
 */
export interface StorageHealth {
  persisted: boolean | null // null = API unsupported
  usage: number | null
  quota: number | null
  opfs: boolean
}

export async function storageHealth(): Promise<StorageHealth> {
  const s = navigator.storage
  let persisted: boolean | null = null
  let usage: number | null = null
  let quota: number | null = null
  try {
    if (s?.persisted) persisted = await s.persisted()
  } catch {
    /* ignore */
  }
  try {
    if (s?.estimate) {
      const e = await s.estimate()
      usage = e.usage ?? null
      quota = e.quota ?? null
    }
  } catch {
    /* ignore */
  }
  return { persisted, usage, quota, opfs: typeof s?.getDirectory === 'function' }
}

/** Ask for persistent storage. Chrome grants it to installed or engaged sites; Safari to installed PWAs. */
export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* ignore */
  }
  return false
}

export function formatBytes(n: number | null): string {
  if (n == null) return '–'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** True on iPhone/iPad Safari when NOT launched as an installed app (data may be evicted). */
export function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
  return ios && !standalone
}
