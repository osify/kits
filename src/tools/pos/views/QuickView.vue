<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Drawer from 'primevue/drawer'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import ItemGrid from '../components/ItemGrid.vue'
import CartLines from '../components/CartLines.vue'
import ModifierDialog from '../components/ModifierDialog.vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useCatalogStore } from '../stores/catalog'
import { useShopStore } from '../stores/shop'
import {
  addLine,
  getQuickSale,
  getSale,
  parseMods,
  setDiscount,
  setLineInternal,
  setLineModifiers,
  setLineQty,
  setNote,
  setQuickStatus,
  today,
  type LineModifier,
  type SaleLine,
  type SaleWithLines,
} from '../db/sales'
import type { Item } from '../db/catalog'
import { getDayClose } from '../db/reports'
import { stockMap } from '../db/stock'

/**
 * Quick Sales (as in LomOr): ONE tally per day. Tap an item each time one is sold;
 * every tap is saved on the device immediately. Submit at the end of the day.
 * "Free" mode records give-aways / staff use, counted but not charged.
 */
const { t } = useI18n()
const toast = useToast()
const cat = useCatalogStore()
const shop = useShopStore()

const date = ref(new Date())
const ymd = computed(() => today(date.value))
const isToday = computed(() => ymd.value === today())
const sale = ref<SaleWithLines | null>(null)
const freeMode = ref(false)
const discount = ref<number | null>(0)
const note = ref('')
const tallyOpen = ref(false)
const dateOpen = ref(false)
const saving = ref(false)

const modOpen = ref(false)
const modItem = ref<Item | null>(null)
const modInitial = ref<LineModifier[]>([])
let modLine: SaleLine | null = null

const dayClosed = ref(false)

async function load(create = false) {
  if (!shop.shop) return
  dayClosed.value = !!(await getDayClose(ymd.value))
  sale.value = await getQuickSale(ymd.value, shop.shop, create && !dayClosed.value)
  discount.value = sale.value?.discount ?? 0
  note.value = sale.value?.note ?? ''
}
const stockObj = ref<Record<string, number>>({})
async function reload() {
  if (sale.value) sale.value = await getSale(sale.value.id)
  stockObj.value = Object.fromEntries(await stockMap())
}

onMounted(async () => {
  if (!cat.loaded) await cat.load()
  await load()
  stockObj.value = Object.fromEntries(await stockMap())
})
watch(ymd, () => load())
watch(dataVersion, () => load())

const locked = computed(() => dayClosed.value || sale.value?.status === 'CLOSED')
const submitted = computed(() => sale.value?.status === 'SUBMITTED')
const counts = computed(() => {
  const m: Record<string, number> = {}
  for (const l of sale.value?.lines ?? []) if (l.item_id) m[l.item_id] = (m[l.item_id] ?? 0) + l.qty
  return m
})
const paidLines = computed(() => (sale.value?.lines ?? []).filter((l) => !l.internal))
const freeLines = computed(() => (sale.value?.lines ?? []).filter((l) => l.internal))
const itemCount = computed(() => paidLines.value.reduce((s, l) => s + l.qty, 0))
const freeCount = computed(() => freeLines.value.reduce((s, l) => s + l.qty, 0))

async function ensureSale() {
  if (!sale.value) await load(true)
  return sale.value!
}

async function pick(item: Item) {
  if (locked.value) return toast.add({ severity: 'warn', summary: t('pos.quick.lockedHint'), life: 3000 })
  const s = await ensureSale()
  // Tap = quick add at base price (like LomOr); use ✎ on the line to choose add-ons.
  await addLine(s.id, item, [], 1, freeMode.value)
  await reload()
}

async function onQty(l: SaleLine, q: number) {
  await setLineQty(l.id, q)
  await reload()
}
async function onInternal(l: SaleLine, on: boolean) {
  await setLineInternal(l.id, on)
  await reload()
}
function editLine(l: SaleLine) {
  const it = l.item_id ? cat.itemById.get(l.item_id) : null
  if (!it) return
  modItem.value = it
  modInitial.value = parseMods(l.modifiers)
  modLine = l
  modOpen.value = true
}
async function onMods(mods: LineModifier[]) {
  if (modLine && modItem.value) await setLineModifiers(modLine.id, modItem.value, mods)
  await reload()
}
async function onDiscount() {
  if (!sale.value) return
  await setDiscount(sale.value.id, discount.value ?? 0)
  await reload()
}
async function onNote() {
  if (sale.value) await setNote(sale.value.id, note.value)
}

async function submit(on: boolean) {
  if (!sale.value) return
  saving.value = true
  try {
    await setQuickStatus(sale.value.id, on ? 'SUBMITTED' : 'DRAFT')
    await reload()
    toast.add({ severity: 'success', summary: on ? t('pos.quick.submitted') : t('pos.quick.reopened'), life: 2500 })
  } finally {
    saving.value = false
  }
}

const statusTag = computed(() => {
  const s = sale.value?.status ?? 'DRAFT'
  return { DRAFT: 'warn', SUBMITTED: 'info', CLOSED: 'success' }[s as 'DRAFT'] ?? 'secondary'
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-xl font-semibold">{{ t('pos.nav.quick') }}</h1>
      <Button
        :label="isToday ? t('pos.c.today') : ymd"
        icon="pi pi-calendar"
        size="small"
        :severity="isToday ? 'secondary' : 'warn'"
        outlined
        @click="dateOpen = !dateOpen"
      />
      <Tag v-if="sale" :severity="statusTag" :value="t(`pos.quick.status.${sale.status.toLowerCase()}`)" />
      <span class="flex-1" />
      <label class="flex items-center gap-2 text-sm">
        <ToggleSwitch v-model="freeMode" :disabled="locked" />
        <i class="pi pi-gift text-amber-600" />{{ t('pos.quick.freeMode') }}
      </label>
    </div>
    <DatePicker v-if="dateOpen" v-model="date" inline :max-date="new Date()" class="self-start" @date-select="dateOpen = false" />
    <p class="text-sm text-[var(--k-muted)]">{{ freeMode ? t('pos.quick.freeHint') : t('pos.quick.hint') }}</p>

    <div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div :class="{ 'pointer-events-none opacity-60': locked }">
        <ItemGrid :counts="counts" :stock="stockObj" @pick="pick" />
      </div>

      <aside class="hidden lg:block">
        <div class="sticky top-20 flex max-h-[calc(100dvh-7rem)] flex-col rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
          <div class="flex items-center gap-2 border-b border-[var(--k-border)] px-4 py-2">
            <h2 class="flex-1 font-semibold">{{ t('pos.quick.tally') }}</h2>
            <span class="text-xs text-[var(--k-muted)]"><i class="pi pi-check" /> {{ t('pos.quick.autosaved') }}</span>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4">
            <p v-if="!sale?.lines.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('pos.quick.empty') }}</p>
            <template v-else>
              <CartLines :lines="paidLines" :readonly="locked" allow-internal @qty="onQty" @edit="editLine" @internal="onInternal" />
              <template v-if="freeLines.length">
                <h3 class="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-400"><i class="pi pi-gift" /> {{ t('pos.quick.freeTitle') }}</h3>
                <CartLines :lines="freeLines" :readonly="locked" allow-internal @qty="onQty" @edit="editLine" @internal="onInternal" />
              </template>
            </template>
          </div>
          <div class="flex flex-col gap-2 border-t border-[var(--k-border)] p-4">
            <div v-if="!locked && sale" class="grid grid-cols-2 gap-2">
              <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.discount') }}<MoneyInput v-model="discount" @blur="onDiscount" /></label>
              <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.note') }}<InputText v-model="note" class="w-full" @blur="onNote" /></label>
            </div>
            <div class="flex justify-between text-sm text-[var(--k-muted)]">
              <span>{{ t('pos.quick.itemsSold', { n: itemCount }) }}</span>
              <span v-if="freeCount">{{ t('pos.quick.itemsFree', { n: freeCount }) }}</span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="font-semibold">{{ t('pos.c.total') }}</span>
              <span class="text-right">
                <span class="text-2xl font-bold">{{ shop.fmt(sale?.total ?? 0) }}</span>
                <span v-if="shop.dual" class="block text-sm text-[var(--k-muted)]">{{ shop.fmtAlt(sale?.total ?? 0) }}</span>
              </span>
            </div>
            <Button
              v-if="!submitted && !locked"
              :label="t('pos.quick.submit')"
              icon="pi pi-send"
              :loading="saving"
              :disabled="!sale?.lines.length"
              @click="submit(true)"
            />
            <Button v-else-if="submitted" :label="t('pos.quick.reopen')" icon="pi pi-pencil" outlined :loading="saving" @click="submit(false)" />
            <p v-else class="text-center text-sm text-[var(--k-muted)]">{{ t('pos.quick.lockedHint') }}</p>
          </div>
        </div>
      </aside>
    </div>

    <div class="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4 lg:hidden">
      <Button class="w-full justify-between shadow-lg" size="large" @click="tallyOpen = true">
        <span><i class="pi pi-list mr-2" />{{ t('pos.quick.itemsSold', { n: itemCount }) }}</span>
        <span class="font-bold">{{ shop.fmt(sale?.total ?? 0) }}</span>
      </Button>
    </div>
    <Drawer v-model:visible="tallyOpen" position="bottom" :header="t('pos.quick.tally')" class="!h-[85dvh]">
      <div class="flex h-full flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <CartLines v-if="sale?.lines.length" :lines="sale.lines" :readonly="locked" allow-internal @qty="onQty" @edit="editLine" @internal="onInternal" />
          <p v-else class="py-10 text-center text-[var(--k-muted)]">{{ t('pos.quick.empty') }}</p>
        </div>
        <div class="flex flex-col gap-2 border-t border-[var(--k-border)] pt-3">
          <div v-if="!locked && sale" class="grid grid-cols-2 gap-2">
            <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.discount') }}<MoneyInput v-model="discount" @blur="onDiscount" /></label>
            <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.note') }}<InputText v-model="note" class="w-full" @blur="onNote" /></label>
          </div>
          <div class="flex items-baseline justify-between">
            <span class="font-semibold">{{ t('pos.c.total') }}</span>
            <span class="text-2xl font-bold">{{ shop.fmt(sale?.total ?? 0) }}</span>
          </div>
          <Button v-if="!submitted && !locked" :label="t('pos.quick.submit')" icon="pi pi-send" :disabled="!sale?.lines.length" @click="submit(true)" />
          <Button v-else-if="submitted" :label="t('pos.quick.reopen')" icon="pi pi-pencil" outlined @click="submit(false)" />
        </div>
      </div>
    </Drawer>

    <ModifierDialog v-model:visible="modOpen" :item="modItem" :groups="modItem ? cat.groupsFor(modItem.id) : []" :initial="modInitial" @confirm="onMods" />
  </div>
</template>
