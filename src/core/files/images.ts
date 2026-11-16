/**
 * Item photos, stored as real files on the device.
 *
 *  - Every photo is resized in the browser (longest side 400px) and saved as WebP
 *    (JPEG if WebP encoding is unsupported). Typical size: 15–40 KB.
 *  - The file name is the SHA-256 of the content, so the same photo is stored and
 *    backed up only once.
 *  - Primary store: OPFS directory `/<tool>-files/images/`. If OPFS writing is not
 *    available (older Safari), photos go to IndexedDB instead. Callers only see paths.
 */
const MAX_SIDE = 400
const QUALITY = 0.8

export interface StoredImage {
  path: string // e.g. "images/3fa4…c1.webp"
  bytes: number
}

const urlCache = new Map<string, string>()

// ── IndexedDB fallback store ─────────────────────────────────────────────────
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kitroid-files', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('files', mode).objectStore('files'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── OPFS ─────────────────────────────────────────────────────────────────────
async function dir(tool: string, create = true): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const base = await root.getDirectoryHandle(`${tool}-files`, { create })
    return await base.getDirectoryHandle('images', { create })
  } catch {
    return null
  }
}

function canWriteOpfs(): boolean {
  return typeof (globalThis as any).FileSystemFileHandle?.prototype?.createWritable === 'function'
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Resize + compress any image the user picks or takes with the camera. */
export async function compressImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, QUALITY))
  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  return (await toBlob('image/jpeg'))!
}

/** Save raw bytes under a given path (used by compress+save and by restore). */
export async function putImage(tool: string, path: string, data: Blob): Promise<void> {
  const name = path.replace(/^images\//, '')
  if (canWriteOpfs()) {
    const d = await dir(tool)
    if (d) {
      const fh = await d.getFileHandle(name, { create: true })
      const w = await fh.createWritable()
      await w.write(data)
      await w.close()
      return
    }
  }
  await idbOp('readwrite', (s) => s.put(data, `${tool}/${path}`))
}

/** Compress and store a photo. Returns the path to keep in the database. */
export async function saveImage(tool: string, file: Blob): Promise<StoredImage> {
  const blob = await compressImage(file)
  const buf = await blob.arrayBuffer()
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `images/${(await sha256Hex(buf)).slice(0, 32)}.${ext}`
  await putImage(tool, path, blob)
  return { path, bytes: blob.size }
}

export async function getImage(tool: string, path: string): Promise<Blob | null> {
  const name = path.replace(/^images\//, '')
  const d = await dir(tool, false)
  if (d) {
    try {
      return await (await d.getFileHandle(name)).getFile()
    } catch {
      /* not in OPFS, try IndexedDB */
    }
  }
  try {
    return (await idbOp<Blob | undefined>('readonly', (s) => s.get(`${tool}/${path}`))) ?? null
  } catch {
    return null
  }
}

/** Object URL for <img src>; cached for the session. */
export async function imageUrl(tool: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const key = `${tool}/${path}`
  const hit = urlCache.get(key)
  if (hit) return hit
  const blob = await getImage(tool, path)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(key, url)
  return url
}

/** All stored image paths (for backups). */
export async function listImages(tool: string): Promise<string[]> {
  const out = new Set<string>()
  const d = await dir(tool, false)
  if (d) {
    for await (const [name, h] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (h.kind === 'file') out.add(`images/${name}`)
    }
  }
  try {
    const keys = await idbOp<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    for (const k of keys) if (typeof k === 'string' && k.startsWith(`${tool}/`)) out.add(k.slice(tool.length + 1))
  } catch {
    /* ignore */
  }
  return [...out]
}

/** Delete images no longer referenced by any record. */
export async function pruneImages(tool: string, keep: Set<string>): Promise<number> {
  let removed = 0
  const d = await dir(tool, false)
  for (const p of await listImages(tool)) {
    if (keep.has(p)) continue
    try {
      if (d) await d.removeEntry(p.replace(/^images\//, ''))
    } catch {
      /* not in OPFS */
    }
    try {
      await idbOp('readwrite', (s) => s.delete(`${tool}/${p}`))
    } catch {
      /* ignore */
    }
    const u = urlCache.get(`${tool}/${p}`)
    if (u) URL.revokeObjectURL(u)
    urlCache.delete(`${tool}/${p}`)
    removed++
  }
  return removed
}
