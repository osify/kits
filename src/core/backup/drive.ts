/**
 * Google Drive backup, straight from the browser (no Kitroid server).
 *
 *  - Sign-in: Google Identity Services token flow; the access token lives ~1 hour,
 *    in memory + sessionStorage only. There is no refresh token in a browser-only app,
 *    so automatic backups run only while a token is valid; otherwise the app asks the
 *    user to tap "Back up now" (one tap re-consents silently if already granted).
 *  - Scope: drive.file. Kitroid can only see files it created itself.
 *  - Layout: My Drive / Kitroid / POS / <shop name> / kitroid-pos-YYYYMMDD-HHmm.zip
 *    Shop folders are found by appProperties.kitroidShop = <shop id>, so renaming the
 *    shop (or the folder) never breaks backups.
 */
import { ref } from 'vue'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const SS_KEY = 'kitroid.driveToken' // one Google sign-in for all tools on this site

export const CLIENT_ID: string = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID ?? ''
export const driveConfigured = !!CLIENT_ID

export interface DriveFile {
  id: string
  name: string
  size?: string
  createdTime: string
  appProperties?: Record<string, string>
}

let token: { value: string; exp: number } | null = null
export const driveSignedIn = ref(false)

function loadToken() {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (raw) {
      const t = JSON.parse(raw)
      if (t.exp > Date.now() + 60_000) token = t
    }
  } catch {
    /* ignore */
  }
  driveSignedIn.value = hasToken()
}
loadToken()

export function hasToken() {
  return !!token && token.exp > Date.now() + 60_000
}

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Could not load Google sign-in. Check your internet connection.'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/** Must be called from a tap/click (opens Google's consent popup the first time). */
export async function signIn(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive backup is not configured for this site.')
  await loadGis()
  await new Promise<void>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error))
        token = { value: resp.access_token, exp: Date.now() + Number(resp.expires_in || 3600) * 1000 }
        try {
          sessionStorage.setItem(SS_KEY, JSON.stringify(token))
        } catch {
          /* ignore */
        }
        driveSignedIn.value = true
        resolve()
      },
      error_callback: (e: any) => reject(new Error(e?.message || e?.type || 'Sign-in cancelled')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export function signOut() {
  if (token && (window as any).google?.accounts?.oauth2) (window as any).google.accounts.oauth2.revoke(token.value, () => {})
  token = null
  driveSignedIn.value = false
  try {
    sessionStorage.removeItem(SS_KEY)
  } catch {
    /* ignore */
  }
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!hasToken()) {
    driveSignedIn.value = false
    throw new Error('NEED_SIGN_IN')
  }
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token!.value}`, ...(init.headers || {}) } })
  if (r.status === 401) {
    signOut()
    throw new Error('NEED_SIGN_IN')
  }
  if (!r.ok) throw new Error(`Google Drive error ${r.status}: ${(await r.text()).slice(0, 200)}`)
  if (r.status === 204) return undefined as T
  const ct = r.headers.get('content-type') || ''
  return (ct.includes('json') ? r.json() : r.arrayBuffer()) as Promise<T>
}

const q = (s: string) => encodeURIComponent(s)

async function findOne(query: string): Promise<DriveFile | null> {
  const r = await api<{ files: DriveFile[] }>(`${API}/files?q=${q(query + ' and trashed = false')}&fields=files(id,name,createdTime,appProperties)&pageSize=10`)
  return r.files[0] ?? null
}

async function createFolder(name: string, parent: string | null, appProperties?: Record<string, string>): Promise<DriveFile> {
  return api<DriveFile>(`${API}/files?fields=id,name,createdTime,appProperties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined, appProperties }),
  })
}

/** Drive folder name per tool: My Drive / Kitroid / <label>. */
const TOOL_FOLDERS: Record<string, string> = { pos: 'POS', money: 'Income & Expense', crm: 'Customers', tongtin: 'Tong Tin', health: 'Health', clinic: 'Clinic', invoice: 'Invoices', payroll: 'Payroll' }

async function toolRoot(tool: string): Promise<string> {
  const kit =
    (await findOne(`mimeType = '${FOLDER}' and appProperties has { key='kitroid' and value='root' }`)) ??
    (await createFolder('Kitroid', null, { kitroid: 'root' }))
  const t =
    (await findOne(`mimeType = '${FOLDER}' and '${kit.id}' in parents and appProperties has { key='kitroid' and value='${tool}' }`)) ??
    (await createFolder(TOOL_FOLDERS[tool] ?? tool, kit.id, { kitroid: tool }))
  return t.id
}

/** One folder per shop / book inside the tool folder, found by its id (renaming never breaks it). */
async function shopFolder(shopId: string, shopName: string, tool = 'pos'): Promise<string> {
  const root = await toolRoot(tool)
  const f =
    (await findOne(`mimeType = '${FOLDER}' and '${root}' in parents and appProperties has { key='kitroidShop' and value='${shopId}' }`)) ??
    (await createFolder(shopName || 'My shop', root, { kitroidShop: shopId }))
  return f.id
}

/** Shops that have backups in this Google account (for restoring onto a new device). */
export async function listShopFolders(tool = 'pos'): Promise<DriveFile[]> {
  const root = await toolRoot(tool)
  const r = await api<{ files: DriveFile[] }>(
    `${API}/files?q=${q(`mimeType = '${FOLDER}' and '${root}' in parents and trashed = false`)}&fields=files(id,name,createdTime,appProperties)&orderBy=name`,
  )
  return r.files
}

export async function listBackups(folderId: string): Promise<DriveFile[]> {
  const r = await api<{ files: DriveFile[] }>(
    `${API}/files?q=${q(`'${folderId}' in parents and trashed = false and mimeType != '${FOLDER}'`)}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&pageSize=200`,
  )
  return r.files
}

export async function shopBackups(shopId: string, shopName: string, tool = 'pos') {
  return listBackups(await shopFolder(shopId, shopName, tool))
}

export async function uploadBackup(shopId: string, shopName: string, name: string, bytes: Uint8Array, tool = 'pos'): Promise<DriveFile> {
  const folder = await shopFolder(shopId, shopName, tool)
  const boundary = `kitroid${Math.random().toString(36).slice(2)}`
  const mime = name.endsWith('.zip') ? 'application/zip' : 'application/octet-stream' // encrypted backups are not zips
  const meta = { name, parents: [folder], mimeType: mime, appProperties: { kitroid: `${tool}-backup` } }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ])
  const f = await api<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=id,name,size,createdTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  await prune(folder).catch(() => {})
  return f
}

export async function downloadBackup(fileId: string): Promise<Uint8Array> {
  return new Uint8Array(await api<ArrayBuffer>(`${API}/files/${fileId}?alt=media`))
}

/** Keep the newest 30 backups, plus the newest one of each month for 12 months. */
async function prune(folderId: string) {
  const files = await listBackups(folderId)
  const keep = new Set(files.slice(0, 30).map((f) => f.id))
  const months = new Set<string>()
  for (const f of files) {
    const m = f.createdTime.slice(0, 7)
    if (!months.has(m) && months.size < 12) {
      months.add(m)
      keep.add(f.id)
    }
  }
  for (const f of files) if (!keep.has(f.id)) await api(`${API}/files/${f.id}`, { method: 'DELETE' })
}

// ── multi-device sync files: <shop folder>/sync/<ulid>_<device>.json.gz ─────
export async function syncFolder(shopId: string, shopName: string): Promise<string> {
  const shop = await shopFolder(shopId, shopName)
  const f =
    (await findOne(`mimeType = '${FOLDER}' and '${shop}' in parents and appProperties has { key='kitroid' and value='sync' }`)) ??
    (await createFolder('sync', shop, { kitroid: 'sync' }))
  return f.id
}

export async function listSyncFiles(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken = ''
  do {
    const r = await api<{ files: DriveFile[]; nextPageToken?: string }>(
      `${API}/files?q=${q(`'${folderId}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,createdTime,appProperties)&orderBy=name&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )
    out.push(...r.files)
    pageToken = r.nextPageToken ?? ''
  } while (pageToken)
  return out
}

export async function uploadSyncFile(folderId: string, name: string, bytes: Uint8Array, deviceId: string): Promise<DriveFile> {
  const boundary = `kitroid${Math.random().toString(36).slice(2)}`
  const meta = { name, parents: [folderId], mimeType: 'application/gzip', appProperties: { kitroid: 'sync-change', device: deviceId } }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ])
  return api<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,appProperties`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await api(`${API}/files/${fileId}`, { method: 'DELETE' })
}
