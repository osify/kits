import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, listServices, setSetting, type Service } from './db/data'

/** Clinic settings + price list. `version` is bumped after changes so screens reload. */
export const useClinic = defineStore('clinic', () => {
  const settings = ref<Record<string, string>>({})
  const services = ref<Service[]>([])
  const version = ref(0)
  async function load() {
    ;[settings.value, services.value] = await Promise.all([getSettings(db), listServices(db)])
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  const currency = computed(() => (settings.value.currency === 'USD' ? 'USD' : 'KHR') as 'KHR' | 'USD')
  async function set(key: string, value: string) {
    await setSetting(db, key, value)
    await load()
  }
  return { settings, services, version, load, ready, name, currency, set, setName: (v: string) => set('book_name', v) }
})
