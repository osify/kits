/**
 * Automatic backups into a real folder on the PC (Chrome / Edge desktop only),
 * via the File System Access API. The folder handle is remembered in IndexedDB;
 * the browser may ask the user to allow access again after a restart.
 */
import { ref } from 'vue'

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window
export const folderName = ref<string | null>(null)

const KEY = 'pos-backup-folder'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kitroid-handles', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('h')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('h', mode).objectStore('h'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await store<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function initFolder() {
  const h = await getHandle()
  folderName.value = h?.name ?? null
}

/** Must be called from a tap/click. */
export async function chooseFolder(): Promise<string> {
  const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'kitroid-pos', mode: 'readwrite' })
  await store('readwrite', (s) => s.put(h, KEY))
  folderName.value = h.name
  return h.name
}

export async function forgetFolder() {
  await store('readwrite', (s) => s.delete(KEY))
  folderName.value = null
}

/** 'granted' | 'prompt' | 'denied' | 'none' */
export async function folderPermission(request = false): Promise<string> {
  const h = await getHandle()
  if (!h) return 'none'
  const opts = { mode: 'readwrite' }
  let p = await (h as any).queryPermission(opts)
  if (p !== 'granted' && request) p = await (h as any).requestPermission(opts)
  return p
}

export async function writeToFolder(name: string, bytes: Uint8Array): Promise<void> {
  const h = await getHandle()
  if (!h) throw new Error('No backup folder chosen')
  if ((await folderPermission()) !== 'granted') throw new Error('NEED_PERMISSION')
  const fh = await h.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(bytes as BlobPart)
  await w.close()
  // Keep the newest 30 Kitroid backups in the folder; never touch other files.
  const ours: string[] = []
  for await (const [n, e] of (h as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (e.kind === 'file' && /^kitroid-pos-\d{8}-\d{4}\.zip$/.test(n)) ours.push(n)
  }
  ours.sort().reverse()
  for (const old of ours.slice(30)) await h.removeEntry(old).catch(() => {})
}
