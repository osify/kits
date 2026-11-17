import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, listItems, setSetting, type Item } from './db/data'

/** Business profile, defaults and saved items. `version` is bumped after changes so screens reload. */
export const useInvoice = defineStore('invoice', () => {
  const settings = ref<Record<string, string>>({})
  const items = ref<Item[]>([])
  const version = ref(0)
  async function load() {
    ;[settings.value, items.value] = await Promise.all([getSettings(db), listItems(db)])
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  const currency = computed(() => (settings.value.currency === 'USD' ? 'USD' : 'KHR') as 'KHR' | 'USD')
  async function set(key: string, value: string) {
    await setSetting(db, key, value)
    await load()
  }
  return { settings, items, version, load, ready, name, currency, set }
})
