import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, setSetting } from './db/data'

/** Employer details and defaults. */
export const usePayroll = defineStore('payroll', () => {
  const settings = ref<Record<string, string>>({})
  async function load() {
    settings.value = await getSettings(db)
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  const currency = computed(() => (settings.value.currency === 'USD' ? 'USD' : 'KHR') as 'KHR' | 'USD')
  const rate = computed(() => Number(settings.value.khr_per_usd || 4100))
  async function set(key: string, value: string) {
    await setSetting(db, key, value)
    await load()
  }
  return { settings, load, ready, name, currency, rate, set }
})
