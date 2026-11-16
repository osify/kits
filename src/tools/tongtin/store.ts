import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, setSetting } from './db/data'
import type { Every } from './rules'

/** Book settings. `version` is bumped after changes so screens reload. */
export const useTongtin = defineStore('tongtin', () => {
  const settings = ref<Record<string, string>>({})
  const version = ref(0)
  async function load() {
    settings.value = await getSettings(db)
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  async function setName(v: string) {
    await setSetting(db, 'book_name', v)
    await load()
  }
  return { settings, version, load, ready, name, setName }
})

export const EVERY: Every[] = ['MONTH', 'HALF_MONTH', 'WEEK', 'DAY']
