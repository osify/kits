import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { balances, getSettings, listCategories, setSetting, type AccountBalance, type Category } from './db/data'
import { formatMoney, type Currency } from '@/core/util/money'

/** Book settings, accounts with balances and categories, kept in memory for the screens. */
export const useBook = defineStore('book', () => {
  const settings = ref<Record<string, string>>({})
  const accounts = ref<AccountBalance[]>([])
  const categories = ref<Category[]>([])
  const loaded = ref(false)
  const version = ref(0) // bumped after every change, screens watch it

  async function load() {
    const [s, a, c] = await Promise.all([getSettings(db), balances(db), listCategories(db)])
    settings.value = s
    accounts.value = a
    categories.value = c
    loaded.value = true
    version.value++
  }

  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  const base = computed<Currency>(() => (settings.value.base_currency as Currency) || 'KHR')
  const rate = computed(() => Number(settings.value.khr_per_usd) || 4100)
  const activeAccounts = computed(() => accounts.value.filter((a) => a.active))
  const accountById = computed(() => new Map(accounts.value.map((a) => [a.id, a])))
  const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])))

  /** Total of all accounts in the base currency (using the current rate). */
  const totalBalance = computed(() =>
    activeAccounts.value.reduce((s, a) => s + (a.currency === base.value ? a.balance : base.value === 'KHR' ? Math.round((a.balance / 100) * rate.value) : Math.round((a.balance / rate.value) * 100)), 0),
  )

  const fmt = (minor: number, cur: Currency = base.value) => formatMoney(minor, cur)

  async function setRate(v: number) {
    await setSetting(db, 'khr_per_usd', String(v))
    await load()
  }
  async function setName(v: string) {
    await setSetting(db, 'book_name', v)
    await load()
  }

  return { settings, accounts, categories, loaded, version, load, ready, name, base, rate, activeAccounts, accountById, categoryById, totalBalance, fmt, setRate, setName }
})

export function catName(c: { name: string | null; name_km?: string | null } | undefined | null, lang: string): string {
  if (!c) return ''
  return (lang === 'km' ? c.name_km || c.name : c.name || c.name_km) ?? ''
}
