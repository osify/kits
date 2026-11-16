/**
 * App lock for private tools (Health, Clinic): a PIN asked when the tool opens and after a few
 * minutes away. It stops other people who use the same phone or PC from opening the tool.
 * It is NOT encryption of the data on the device (browsers keep site storage readable to anyone
 * with full access to the device); encrypted backups protect the copies that leave the device.
 *
 * Only a salted PBKDF2 hash of the PIN is stored (localStorage, per tool). Too many wrong
 * attempts add a growing wait.
 */
import { reactive } from 'vue'
import { prefs } from '@/core/util/prefs'

const ITER = 200_000
const enc = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function hash(pin: string, salt: Uint8Array): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, base, 256)
  return enc(new Uint8Array(bits))
}

export function createLock(tool: string) {
  const key = (k: string) => `${tool}.lock.${k}`
  const state = reactive({
    enabled: !!prefs.get(key('hash')),
    locked: !!prefs.get(key('hash')),
    minutes: Number(prefs.get(key('minutes')) || 5),
    failures: Number(prefs.get(key('failures')) || 0),
    waitUntil: Number(prefs.get(key('waitUntil')) || 0),
    hidden: false, // screen blurred while the app is in the background
  })

  async function setPin(pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    prefs.set(key('salt'), enc(salt))
    prefs.set(key('hash'), await hash(pin, salt))
    state.enabled = true
    state.locked = false
  }
  function removePin() {
    for (const k of ['hash', 'salt', 'failures', 'waitUntil']) prefs.remove(key(k))
    state.enabled = false
    state.locked = false
    state.failures = 0
  }
  function setMinutes(m: number) {
    state.minutes = m
    prefs.set(key('minutes'), String(m))
  }
  async function check(pin: string): Promise<boolean> {
    const salt = prefs.get(key('salt'))
    const h = prefs.get(key('hash'))
    if (!salt || !h) return true
    return (await hash(pin, dec(salt))) === h
  }
  /** Try to unlock. Returns 'ok', 'wrong' or 'wait' (too many attempts). */
  async function unlock(pin: string): Promise<'ok' | 'wrong' | 'wait'> {
    if (Date.now() < state.waitUntil) return 'wait'
    if (await check(pin)) {
      state.locked = false
      state.failures = 0
      prefs.remove(key('failures'))
      prefs.remove(key('waitUntil'))
      touch()
      return 'ok'
    }
    state.failures++
    prefs.set(key('failures'), String(state.failures))
    if (state.failures >= 5) {
      state.waitUntil = Date.now() + Math.min(30, 2 ** (state.failures - 5)) * 60_000
      prefs.set(key('waitUntil'), String(state.waitUntil))
    }
    return 'wrong'
  }
  function lockNow() {
    if (state.enabled) state.locked = true
  }

  // Lock after `minutes` of no use, or when coming back after `minutes` in the background.
  let last = Date.now()
  let hiddenAt = 0
  function touch() {
    last = Date.now()
  }
  let started = false
  function start() {
    if (started) return
    started = true
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, touch, { passive: true })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        state.hidden = state.enabled
      } else {
        state.hidden = false
        if (state.enabled && hiddenAt && Date.now() - hiddenAt > state.minutes * 60_000) state.locked = true
      }
    })
    setInterval(() => {
      if (state.enabled && !state.locked && Date.now() - last > state.minutes * 60_000) state.locked = true
    }, 15_000)
  }

  return { state, setPin, removePin, setMinutes, unlock, lockNow, check, start, touch }
}

export type AppLock = ReturnType<typeof createLock>
