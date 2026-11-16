/**
 * One tab at a time per database. The OPFS SAH-pool VFS holds exclusive file handles,
 * so a second tab must not open the same database. We use the Web Locks API to hold
 * the lock, and a BroadcastChannel so a new tab can ask the current one to let go
 * ("Use here").
 */
export interface TabLock {
  /** Resolves when this tab holds the lock. */
  acquired: Promise<void>
  release: () => void
}

type LostHandler = () => Promise<void> | void

export function supportsLocks() {
  return typeof navigator !== 'undefined' && !!navigator.locks
}

/**
 * Try to get the lock without waiting. Returns null if another tab has it.
 * `onTakeover` runs when another tab asks for the database; it must close the DB.
 */
export async function tryLock(name: string, onTakeover: LostHandler): Promise<TabLock | null> {
  if (!supportsLocks()) return fakeLock()
  return new Promise((resolve) => {
    navigator.locks.request(`kitroid:${name}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null)
        return
      }
      return holdUntilReleased(name, onTakeover, resolve)
    })
  })
}

/** Ask the tab that holds the lock to close, then wait for it. */
export async function takeOver(name: string, onTakeover: LostHandler): Promise<TabLock> {
  if (!supportsLocks()) return fakeLock()
  const ch = new BroadcastChannel(`kitroid:${name}`)
  ch.postMessage({ type: 'takeover' })
  ch.close()
  return new Promise((resolve) => {
    navigator.locks.request(`kitroid:${name}`, (lock) => {
      if (!lock) return
      return holdUntilReleased(name, onTakeover, resolve)
    })
  })
}

function holdUntilReleased(name: string, onTakeover: LostHandler, resolve: (l: TabLock) => void) {
  return new Promise<void>((release) => {
    const ch = new BroadcastChannel(`kitroid:${name}`)
    const done = () => {
      ch.close()
      release()
    }
    ch.onmessage = async (e) => {
      if (e.data?.type !== 'takeover') return
      try {
        await onTakeover()
      } finally {
        done()
      }
    }
    resolve({ acquired: Promise.resolve(), release: done })
  })
}

function fakeLock(): TabLock {
  return { acquired: Promise.resolve(), release: () => {} }
}
