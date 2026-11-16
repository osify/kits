import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, listPeople, setSetting, type Person } from './db/data'

/** Book settings + family members. `version` is bumped after changes so screens reload. */
export const useHealth = defineStore('health', () => {
  const settings = ref<Record<string, string>>({})
  const people = ref<Person[]>([])
  const version = ref(0)
  async function load() {
    ;[settings.value, people.value] = await Promise.all([getSettings(db), listPeople(db)])
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  async function setName(v: string) {
    await setSetting(db, 'book_name', v)
    await load()
  }
  const personName = (id: string) => people.value.find((p) => p.id === id)?.name ?? '?'
  const personColor = (id: string) => people.value.find((p) => p.id === id)?.color ?? '#059669'
  return { settings, people, version, load, ready, name, setName, personName, personColor }
})

/** Colours for family members (distinct, readable in light and dark). */
export const PERSON_COLORS = ['#059669', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626']
