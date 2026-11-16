import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { allTags, getSettings, setSetting } from './db/data'

/** Book settings + known tags. `version` is bumped after changes so screens reload. */
export const useCrm = defineStore('crm', () => {
  const settings = ref<Record<string, string>>({})
  const tags = ref<string[]>([])
  const version = ref(0)
  async function load() {
    ;[settings.value, tags.value] = await Promise.all([getSettings(db), allTags(db)])
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  async function setName(v: string) {
    await setSetting(db, 'book_name', v)
    await load()
  }
  return { settings, tags, version, load, ready, name, setName }
})

/** Telegram / phone links (open the app on the phone). */
export const telLink = (phone: string | null) => (phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null)
export const tgLink = (tg: string | null) => {
  if (!tg) return null
  const v = tg.trim().replace(/^@/, '')
  return /^\+?\d[\d\s]+$/.test(v) ? `https://t.me/+${v.replace(/\D/g, '')}` : `https://t.me/${v}`
}
