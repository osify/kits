import { reactive, ref, watch } from 'vue'
import { prefs } from '@/core/util/prefs'
import type { Currency } from '@/core/util/money'

/**
 * The finance tool stores nothing but the last inputs of each calculator on this device
 * (so a refresh keeps your numbers). Nothing leaves the device.
 */
export function persisted<T extends object>(key: string, defaults: T): T {
  let saved: Partial<T> = {}
  try {
    saved = JSON.parse(prefs.get(`fin.${key}`) || '{}')
  } catch {
    /* ignore corrupt prefs */
  }
  const state = reactive({ ...defaults, ...saved }) as T
  watch(state, (v) => prefs.set(`fin.${key}`, JSON.stringify(v)), { deep: true })
  return state
}

/** Currency used across the calculators; KHR = whole riel, USD = cents. */
export const currency = ref<Currency>((prefs.get('fin.currency') as Currency) || 'KHR')
watch(currency, (c) => prefs.set('fin.currency', c))

export const RIEL_STEP = 100
export const step = () => (currency.value === 'KHR' ? RIEL_STEP : 1)
