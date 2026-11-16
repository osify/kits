import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getShop, saveShop, type Shop, type ShopInput } from '../db/shop'
import { formatMoney, roundRiel, type Currency } from '@/core/util/money'

/** The current shop + money formatting in the shop's currencies. */
export const useShopStore = defineStore('shop', () => {
  const shop = ref<Shop | null>(null)
  const loaded = ref(false)

  async function load() {
    shop.value = (await getShop()) ?? null
    loaded.value = true
    return shop.value
  }

  async function save(input: ShopInput) {
    shop.value = await saveShop(input)
    return shop.value
  }

  const base = computed<Currency>(() => shop.value?.base_currency ?? 'KHR')
  const alt = computed<Currency>(() => (base.value === 'KHR' ? 'USD' : 'KHR'))
  const rate = computed(() => shop.value?.khr_per_usd || 4100)
  const step = computed(() => shop.value?.riel_step || 100)
  const dual = computed(() => !!shop.value?.show_dual)

  /** Convert minor units of the base currency to the other currency. */
  function toAlt(minor: number): number {
    return base.value === 'KHR' ? Math.round((minor / rate.value) * 100) : roundRiel((minor / 100) * rate.value, step.value)
  }
  /** Convert minor units of `cur` into the base currency. */
  function toBase(minor: number, cur: Currency): number {
    if (cur === base.value) return minor
    return base.value === 'KHR' ? roundRiel((minor / 100) * rate.value, step.value) : Math.round((minor / rate.value) * 100)
  }

  const fmt = (minor: number) => formatMoney(minor, base.value)
  const fmtAlt = (minor: number) => formatMoney(toAlt(minor), alt.value)
  /** "12,500 ៛ · $3.05" when dual display is on. */
  const fmtDual = (minor: number) => (dual.value ? `${fmt(minor)} · ${fmtAlt(minor)}` : fmt(minor))

  /** Parse what a person types (riel or dollars) into minor units of `cur`. */
  function parseInput(v: number | null | undefined, cur: Currency = base.value): number {
    if (v == null || Number.isNaN(v)) return 0
    return cur === 'KHR' ? Math.round(v) : Math.round(v * 100)
  }
  /** Minor units → the number shown in an input (riel as-is, USD in dollars). */
  function toInput(minor: number | null | undefined, cur: Currency = base.value): number {
    if (minor == null) return 0
    return cur === 'KHR' ? minor : minor / 100
  }

  return { shop, loaded, load, save, base, alt, rate, step, dual, toAlt, toBase, fmt, fmtAlt, fmtDual, parseInput, toInput }
})
