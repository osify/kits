<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import DailyBars from '../components/DailyBars.vue'
import Receipt from '../components/Receipt.vue'
import ZReport from '../components/ZReport.vue'
import PrintSheet from '../components/PrintSheet.vue'
import CartLines from '../components/CartLines.vue'
import { useShopStore } from '../stores/shop'
import { useCatalogStore } from '../stores/catalog'
import { summary, byDay, topItems, getDayClose, closeDay, reopenDay, exportCsv, type Summary, type DayRow, type TopItem, type DayClose } from '../db/reports'
import { listSales, getSale, voidSale, today, type SaleRow, type SaleWithLines } from '../db/sales'
import { autoBackup } from '../backup'
import { directPrinting, printBlocks, printer, receiptBlocks, zBlocks } from '../print'
import { license } from '@/core/license'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const shop = useShopStore()
const cat = useCatalogStore()

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom'
const preset = ref<Preset>('today')
const custom = ref<Date[] | null>(null)
const presets = computed(() =>
  (['today', 'yesterday', 'week', 'month', 'lastMonth', 'custom'] as Preset[]).map((p) => ({ label: t(`pos.sum.p.${p}`), value: p })),
)

const range = computed<[string, string]>(() => {
  const now = new Date()
  const d = (y: number, m: number, day: number) => today(new Date(y, m, day))
  switch (preset.value) {
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return [today(y), today(y)]
    }
    case 'week': {
      const s = new Date(now)
      s.setDate(s.getDate() - ((s.getDay() + 6) % 7)) // Monday
      return [today(s), today(now)]
    }
    case 'month':
      return [d(now.getFullYear(), now.getMonth(), 1), today(now)]
    case 'lastMonth':
      return [d(now.getFullYear(), now.getMonth() - 1, 1), d(now.getFullYear(), now.getMonth(), 0)]
    case 'custom': {
      const r = custom.value
      if (r?.[0]) return [today(r[0]), today(r[1] ?? r[0])]
      return [today(now), today(now)]
    }
    default:
      return [today(now), today(now)]
  }
})
const singleDay = computed(() => range.value[0] === range.value[1])

const sum = ref<Summary | null>(null)
const days = ref<DayRow[]>([])
const top = ref<TopItem[]>([])
const sales = ref<SaleRow[]>([])
const dayClose = ref<DayClose | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const [f, to] = range.value
    const base = shop.base
    ;[sum.value, days.value, top.value, sales.value] = await Promise.all([summary(f, to, base), byDay(f, to, base), topItems(f, to, base), listSales(f, to)])
    dayClose.value = singleDay.value ? ((await getDayClose(f)) ?? null) : null
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  if (!cat.loaded) await cat.load()
  await load()
})
watch(range, load)
watch(dataVersion, load)

const avg = computed(() => (sum.value && sum.value.sales ? Math.round(sum.value.net / sum.value.sales) : 0))
const isFuture = computed(() => range.value[0] > today())

// ── day close ──
function onClose() {
  const date = range.value[0]
  confirm.require({
    header: t('pos.sum.closeDay'),
    message: t('pos.sum.closeConfirm', { date }),
    icon: 'pi pi-lock',
    acceptProps: { label: t('pos.sum.closeDay') },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await closeDay(date, shop.base)
      await load()
      toast.add({ severity: 'success', summary: t('pos.sum.closed'), life: 2500 })
      autoBackup(true).catch(() => {})
    },
  })
}
function onReopen() {
  const date = range.value[0]
  confirm.require({
    header: t('pos.sum.reopen'),
    message: t('pos.sum.reopenConfirm', { date }),
    icon: 'pi pi-lock-open',
    acceptProps: { label: t('pos.sum.reopen'), severity: 'warn' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await reopenDay(date)
      await load()
    },
  })
}

// ── printing ──
const printZ = ref(false)
const printReceipt = ref(false)

// ── sale detail / void ──
const viewSale = ref<SaleWithLines | null>(null)
const voidReason = ref('')
async function openSale(r: SaleRow) {
  viewSale.value = await getSale(r.id)
  voidReason.value = ''
}
async function onVoid() {
  if (!viewSale.value) return
  try {
    await voidSale(viewSale.value.id, voidReason.value)
    viewSale.value = null
    await load()
    toast.add({ severity: 'success', summary: t('pos.sum.voided'), life: 2500 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e.message === 'DAY_CLOSED' ? t('pos.sum.voidClosed') : e.message, life: 4000 })
  }
}

async function onExport() {
  const [f, to] = range.value
  const csv = await exportCsv(f, to)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-sales-${f}${f === to ? '' : `_${to}`}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function direct(fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e: any) {
    if (e?.name !== 'NotFoundError') toast.add({ severity: 'error', summary: t('pos.printer.failed'), detail: e.message, life: 5000 })
  }
}
function onPrintZ() {
  if (!sum.value || !shop.shop) return
  if (!directPrinting()) return void (printZ.value = true)
  const blocks = zBlocks({ title: zTitle.value, from: range.value[0], to: range.value[1], sum: sum.value, top: top.value, closedAt: dayClose.value?.closed_at }, shop.shop, t, shop.fmt)
  direct(() => printBlocks(blocks, shop.shop!.paper_mm))
}
function onPrintReceipt() {
  if (!viewSale.value || !shop.shop) return
  if (!directPrinting()) return void (printReceipt.value = true)
  const s = viewSale.value
  direct(async () => printBlocks(await receiptBlocks(s, shop.shop!, t, license.value?.name), shop.shop!.paper_mm))
}

const statusSev = (s: string) => ({ PAID: 'success', SUBMITTED: 'info', CLOSED: 'secondary', VOID: 'danger', DRAFT: 'warn' })[s] ?? 'secondary'
const zTitle = computed(() => (singleDay.value ? t('pos.sum.zReport') : t('pos.sum.periodReport')))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">{{ t('pos.nav.summary') }}</h1>
      <Button icon="pi pi-print" :label="zTitle" size="small" outlined :disabled="!sum" :loading="printer.busy" @click="onPrintZ" />
      <Button icon="pi pi-file-excel" :label="t('pos.sum.exportCsv')" size="small" outlined @click="onExport" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <SelectButton v-model="preset" :options="presets" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
      <DatePicker v-if="preset === 'custom'" v-model="custom" selection-mode="range" :manual-input="false" date-format="yy-mm-dd" show-icon :placeholder="t('pos.sum.pickRange')" />
    </div>

    <!-- Day close banner (single day only) -->
    <div v-if="singleDay && !isFuture" class="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-3">
      <i :class="dayClose ? 'pi pi-lock text-primary-600' : 'pi pi-lock-open text-amber-600'" class="text-xl" />
      <span class="flex-1">
        <b>{{ range[0] }}</b> ·
        {{ dayClose ? t('pos.sum.dayClosed', { time: new Date(dayClose.closed_at).toLocaleTimeString() }) : t('pos.sum.dayOpen') }}
      </span>
      <Button v-if="!dayClose" :label="t('pos.sum.closeDay')" icon="pi pi-lock" size="small" @click="onClose" />
      <Button v-else :label="t('pos.sum.reopen')" icon="pi pi-lock-open" size="small" text severity="warn" @click="onReopen" />
    </div>

    <template v-if="sum">
      <!-- Headline numbers -->
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="col-span-2 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 lg:col-span-1">
          <div class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.net') }}</div>
          <div class="text-3xl font-bold tabular-nums">{{ shop.fmt(sum.net) }}</div>
          <div v-if="shop.dual" class="text-sm text-[var(--k-muted)]">{{ shop.fmtAlt(sum.net) }}</div>
        </div>
        <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
          <div class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.tickets') }}</div>
          <div class="text-2xl font-semibold tabular-nums">{{ sum.posCount }}</div>
          <div v-if="sum.quickCount" class="text-xs text-[var(--k-muted)]">+ {{ t('pos.sum.quickDays', { n: sum.quickCount }) }}</div>
        </div>
        <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
          <div class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.items') }}</div>
          <div class="text-2xl font-semibold tabular-nums">{{ sum.items }}</div>
          <div v-if="sum.internalItems" class="text-xs text-[var(--k-muted)]">+ {{ sum.internalItems }} {{ t('pos.quick.free') }}</div>
        </div>
        <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
          <div class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.avg') }}</div>
          <div class="text-2xl font-semibold tabular-nums">{{ shop.fmt(avg) }}</div>
        </div>
      </section>

      <Message v-if="sum.pendingCount" severity="warn" :closable="false">
        {{ t('pos.sum.pending', { n: sum.pendingCount, amount: shop.fmt(sum.pending) }) }}
      </Message>

      <section class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
          <h2 class="mb-2 font-semibold">{{ t('pos.sum.byMethod') }}</h2>
          <dl class="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>{{ t('pos.sell.method.cash') }}</dt><dd class="text-right tabular-nums">{{ shop.fmt(sum.cash) }}</dd>
            <dt>KHQR</dt><dd class="text-right tabular-nums">{{ shop.fmt(sum.khqr) }}</dd>
            <dt>{{ t('pos.sum.otherPay') }}</dt><dd class="text-right tabular-nums">{{ shop.fmt(sum.other) }}</dd>
            <dt>{{ t('pos.sum.quick') }}</dt><dd class="text-right tabular-nums">{{ shop.fmt(sum.quick) }}</dd>
            <template v-if="sum.debt || sum.collected">
              <dt>{{ t('pos.sum.debt') }}</dt><dd class="text-right tabular-nums text-amber-600">{{ shop.fmt(sum.debt) }}</dd>
              <dt>{{ t('pos.sum.collected') }}</dt><dd class="text-right tabular-nums">{{ shop.fmt(sum.collected) }}</dd>
            </template>
            <dt class="font-semibold">{{ t('pos.sum.cashDrawer') }}</dt><dd class="text-right font-semibold tabular-nums">{{ shop.fmt(sum.cash + sum.collectedCash) }}</dd>
            <dt class="border-t border-[var(--k-border)] pt-1 text-[var(--k-muted)]">{{ t('pos.sum.gross') }}</dt>
            <dd class="border-t border-[var(--k-border)] pt-1 text-right tabular-nums text-[var(--k-muted)]">{{ shop.fmt(sum.gross) }}</dd>
            <dt class="text-[var(--k-muted)]">{{ t('pos.c.discount') }}</dt>
            <dd class="text-right tabular-nums text-[var(--k-muted)]">-{{ shop.fmt(sum.discount) }}</dd>
          </dl>
        </div>
        <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
          <h2 class="mb-2 font-semibold">{{ t('pos.sum.topItems') }}</h2>
          <p v-if="!top.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.noData') }}</p>
          <table v-else class="w-full text-sm">
            <thead class="text-left text-[var(--k-muted)]">
              <tr><th class="font-normal">{{ t('pos.c.item') }}</th><th class="text-right font-normal">{{ t('pos.c.qty') }}</th><th class="text-right font-normal">{{ t('pos.c.amount') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="i in top.slice(0, 10)" :key="i.name" class="border-t border-[var(--k-border)]">
                <td class="py-1">{{ i.name }}</td>
                <td class="text-right tabular-nums">{{ i.qty }}<span v-if="i.internal" class="text-amber-600"> +{{ i.internal }}</span></td>
                <td class="text-right tabular-nums">{{ shop.fmt(i.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="!singleDay" class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <h2 class="mb-2 font-semibold">{{ t('pos.sum.daily') }}</h2>
        <DailyBars :days="days" :from="range[0]" :to="range[1]" />
        <details class="mt-2 text-sm">
          <summary class="cursor-pointer text-[var(--k-muted)]">{{ t('pos.sum.showTable') }}</summary>
          <table class="mt-2 w-full">
            <tbody>
              <tr v-for="d in days" :key="d.date" class="border-t border-[var(--k-border)]">
                <td class="py-1">{{ d.date }} <i v-if="d.closed" class="pi pi-lock text-xs text-[var(--k-muted)]" /></td>
                <td class="text-right tabular-nums">{{ t('pos.sum.salesN', { n: d.sales }) }}</td>
                <td class="text-right tabular-nums">{{ shop.fmt(d.net) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-2">
        <h2 class="px-2 pt-2 font-semibold">{{ t('pos.sum.salesList') }}</h2>
        <DataTable :value="sales" :loading="loading" data-key="id" paginator :rows="20" size="small" class="text-sm" row-hover @row-click="(e: any) => openSale(e.data)">
          <template #empty><p class="py-6 text-center text-[var(--k-muted)]">{{ t('pos.sum.noData') }}</p></template>
          <Column field="number" :header="t('pos.sum.col.number')" />
          <Column :header="t('pos.sum.col.date')">
            <template #body="{ data }">{{ data.business_date }} {{ data.kind === 'POS' ? new Date(data.created_at).toTimeString().slice(0, 5) : '' }}</template>
          </Column>
          <Column :header="t('pos.sum.col.type')">
            <template #body="{ data }">{{ data.kind === 'POS' ? (data.method === 'KHQR' ? 'KHQR' : t(`pos.sell.method.${(data.method || 'cash').toLowerCase()}`)) : t('pos.nav.quick') }}<span v-if="data.customer_name" class="text-[var(--k-muted)]"> · {{ data.customer_name }}</span></template>
          </Column>
          <Column :header="t('pos.sum.col.status')">
            <template #body="{ data }"><Tag :severity="statusSev(data.status)" :value="t(`pos.status.${data.status.toLowerCase()}`)" /></template>
          </Column>
          <Column field="items" :header="t('pos.c.qty')" class="text-right" />
          <Column :header="t('pos.c.total')" class="text-right">
            <template #body="{ data }"><span :class="{ 'line-through opacity-60': data.status === 'VOID' }">{{ shop.fmt(shop.toBase(data.total, data.currency)) }}</span></template>
          </Column>
        </DataTable>
      </section>
    </template>

    <Dialog :visible="!!viewSale" modal :header="viewSale ? `#${viewSale.number}` : ''" class="w-[min(28rem,calc(100vw-1.5rem))]" @update:visible="viewSale = null">
      <template v-if="viewSale">
        <div class="mb-2 flex items-center gap-2 text-sm">
          <Tag :severity="statusSev(viewSale.status)" :value="t(`pos.status.${viewSale.status.toLowerCase()}`)" />
          <span>{{ viewSale.business_date }}</span>
          <span v-if="viewSale.void_reason" class="text-[var(--k-muted)]">· {{ viewSale.void_reason }}</span>
        </div>
        <CartLines :lines="viewSale.lines" readonly />
        <div class="mt-2 flex justify-between font-semibold">
          <span>{{ t('pos.c.total') }}</span><span>{{ shop.fmt(shop.toBase(viewSale.total, viewSale.currency)) }}</span>
        </div>
        <div v-if="viewSale.kind === 'POS' && viewSale.status === 'PAID'" class="mt-4 flex gap-2">
          <InputText v-model="voidReason" :placeholder="t('pos.sum.voidReason')" class="flex-1" />
          <Button :label="t('pos.sum.void')" severity="danger" outlined icon="pi pi-ban" @click="onVoid" />
        </div>
      </template>
      <template #footer>
        <Button v-if="viewSale?.kind === 'POS'" :label="t('pos.sell.printReceipt')" icon="pi pi-print" outlined @click="onPrintReceipt" />
        <Button :label="t('pos.c.close')" @click="viewSale = null" />
      </template>
    </Dialog>

    <PrintSheet v-model:open="printZ" :paper-mm="shop.shop?.paper_mm">
      <ZReport v-if="sum" :title="zTitle" :from="range[0]" :to="range[1]" :sum="sum" :top="top" :closed-at="dayClose?.closed_at" />
    </PrintSheet>
    <PrintSheet v-model:open="printReceipt" :paper-mm="shop.shop?.paper_mm">
      <Receipt v-if="viewSale" :sale="viewSale" />
    </PrintSheet>
  </div>
</template>
