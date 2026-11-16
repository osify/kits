<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import ScanCode from '@/components/ScanCode.vue'
import { decodeKx, matchScore, rxQty, type RxPayload } from '@/core/exchange/codec'
import { db } from '../db'
import { useCatalogStore } from '../stores/catalog'
import { useShopStore } from '../stores/shop'
import type { Item } from '../db/catalog'

/**
 * Pharmacy: read a clinic prescription (Kitroid code) and put the medicines in the cart, matched to
 * this shop's own products and prices. The code holds no diagnosis. The prescription id is kept in the
 * sale note so a second sale of the same prescription is flagged.
 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ add: [lines: { item: Item; qty: number }[], note: string] }>()
const { t } = useI18n()
const cat = useCatalogStore()
const shop = useShopStore()
const scanning = ref(false)
const rx = ref<RxPayload | null>(null)
const err = ref('')
const already = ref<{ number: string | null; business_date: string } | null>(null)
const rows = reactive<{ itemId: string | null; qty: number }[]>([])

watch(open, (v) => {
  if (v) {
    rx.value = null
    err.value = ''
    scanning.value = true
  }
})
watch(scanning, (v) => {
  if (!v && !rx.value) open.value = false
})
async function onCode(text: string) {
  try {
    const d = decodeKx(text)
    if (d.type !== 'rx') throw new Error('UNKNOWN_TYPE')
    rx.value = d.data
  } catch (e: any) {
    err.value = t(`kx.err.${e.message}`, t('kx.err.BAD_CODE'))
    rx.value = null
    return
  }
  already.value =
    (await db.get<{ number: string | null; business_date: string }>(
      `SELECT number, business_date FROM sale WHERE note LIKE ? AND status IN ('PAID','CLOSED') ORDER BY created_at DESC LIMIT 1`,
      [`%${rx.value.id}%`],
    )) ?? null
  rows.splice(0, rows.length, ...rx.value.items.map((i) => ({ itemId: bestMatch(i.n)?.id ?? null, qty: rxQty(i) })))
}
const items = computed(() => cat.items.filter((i) => i.active))
function bestMatch(name: string): Item | null {
  let best: Item | null = null
  let score = 0
  for (const it of items.value) {
    const s = Math.max(matchScore(name, it.name), it.name_km ? matchScore(name, it.name_km) : 0)
    if (s > score) (best = it), (score = s)
  }
  return score >= 40 ? best : null
}
const optsFor = (name: string) =>
  [...items.value]
    .map((it) => ({ it, s: Math.max(matchScore(name, it.name), it.name_km ? matchScore(name, it.name_km) : 0) }))
    .sort((a, b) => b.s - a.s || a.it.name.localeCompare(b.it.name))
    .map(({ it }) => ({ label: `${it.name} · ${shop.fmt(it.price)}`, value: it.id }))
const how = (i: RxPayload['items'][number]) => [i.d, i.t ? t('cl.timesDay', { n: i.t }) : '', i.days ? t('cl.forDays', { n: i.days }) : '', i.note].filter(Boolean).join(' · ')
const ready = computed(() => rows.filter((r) => r.itemId && r.qty > 0))
function add() {
  if (!rx.value) return
  const lines = ready.value.map((r) => ({ item: items.value.find((i) => i.id === r.itemId)!, qty: r.qty }))
  emit('add', lines, `Rx ${rx.value.code} ${rx.value.id}`)
  open.value = false
}
</script>

<template>
  <ScanCode v-model:open="scanning" :title="t('kx.scanRx')" @code="onCode" />
  <Dialog :visible="open && !scanning" modal :header="t('kx.rxTitle')" class="w-[min(36rem,calc(100vw-1rem))]" @update:visible="(v: boolean) => (open = v)">
    <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>
    <div v-if="rx" class="flex flex-col gap-3">
      <div class="rounded-lg bg-[var(--k-border)]/40 p-3 text-sm">
        <div class="font-semibold">{{ rx.clinic }}<template v-if="rx.doctor"> · {{ rx.doctor }}</template></div>
        <div class="text-[var(--k-muted)]">
          {{ rx.date }} · {{ t('cl.patientCode') }} <b class="font-mono">{{ rx.code }}</b>
          <template v-if="rx.name"> · {{ rx.name }}</template>
          <template v-if="rx.age !== undefined"> · {{ t('hl.years', { n: rx.age }) }}</template>
          <template v-if="rx.sex"> · {{ t(`hl.sex${rx.sex}`) }}</template>
          <template v-if="rx.phone"> · {{ rx.phone }}</template>
        </div>
      </div>
      <Message v-if="already" severity="warn" :closable="false">{{ t('kx.alreadySold', { date: already.business_date, no: already.number ?? '' }) }}</Message>
      <ul class="flex flex-col divide-y divide-[var(--k-border)]">
        <li v-for="(i, k) in rx.items" :key="k" class="flex flex-col gap-2 py-2">
          <div>
            <span class="font-semibold">{{ i.n }}</span>
            <span class="block text-xs text-[var(--k-muted)]">{{ how(i) }}<template v-if="i.q"> · {{ t('cl.qty') }} {{ i.q }} {{ i.u ?? '' }}</template></span>
          </div>
          <div class="flex gap-2">
            <Select v-model="rows[k].itemId" :options="optsFor(i.n)" option-label="label" option-value="value" filter show-clear :placeholder="t('kx.pickProduct')" class="min-w-0 flex-1" />
            <InputNumber v-model="rows[k].qty" :min="0" :max="9999" input-class="w-16 text-right" :aria-label="t('cl.qty')" @input="(e: any) => (rows[k].qty = e.value ?? 0)" />
          </div>
          <small v-if="!rows[k].itemId" class="text-amber-700 dark:text-amber-400">{{ t('kx.noMatch') }}</small>
        </li>
      </ul>
      <p class="text-xs text-[var(--k-muted)]"><i class="pi pi-shield mr-1" />{{ t('kx.rxPrivacy') }}</p>
    </div>
    <template #footer>
      <Button :label="t('kx.scanAgain')" icon="pi pi-qrcode" text @click="scanning = true" />
      <span class="flex-1" />
      <Button :label="t('common.cancel')" text @click="open = false" />
      <Button :label="t('kx.addToCart', { n: ready.length })" icon="pi pi-cart-plus" :disabled="!ready.length" @click="add" />
    </template>
  </Dialog>
</template>
