<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { db } from '../db'
import { invoicesCsv, monthReport, outstanding, type MonthRow } from '../db/data'
import { formatMoney, type Currency } from '@/core/util/money'
import { today } from '@/core/util/date'

/** By month and currency: invoiced, VAT (output tax), received; still to collect; CSV for the accountant. */
const { t } = useI18n()
const todayStr = today()
const year = ref(todayStr.slice(0, 4))
const years = Array.from({ length: 6 }, (_, i) => String(Number(todayStr.slice(0, 4)) - i))
const rows = ref<MonthRow[]>([])
const owed = ref<Awaited<ReturnType<typeof outstanding>> | null>(null)
async function load() {
  ;[rows.value, owed.value] = await Promise.all([monthReport(db, year.value), outstanding(db, todayStr)])
}
onMounted(load)
watch(year, load)
const currencies = computed(() => (['USD', 'KHR'] as Currency[]).filter((c) => rows.value.some((r) => r.currency === c)))
const of = (c: Currency) => rows.value.filter((r) => r.currency === c)
const sum = (c: Currency, k: 'invoices' | 'invoiced' | 'vat' | 'received') => of(c).reduce((s, r) => s + r[k], 0)
const monthName = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' })
async function exportCsv() {
  const url = URL.createObjectURL(new Blob([await invoicesCsv(db, `${year.value}-01-01`, `${year.value}-12-31`)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-invoices-${year.value}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('iv.nav.report') }}</h1>
      <Select v-model="year" :options="years" class="w-28" />
      <Button :label="t('iv.exportInvoices')" icon="pi pi-file-excel" outlined @click="exportCsv" />
    </div>

    <div v-if="owed" class="grid gap-3 sm:grid-cols-2">
      <template v-for="c in ['USD', 'KHR'] as const" :key="c">
        <div v-if="owed[c].count" class="card flex flex-col gap-1">
          <span class="text-sm text-[var(--k-muted)]">{{ t('iv.toCollect') }} ({{ c }})</span>
          <span class="text-2xl font-semibold tabular-nums">{{ formatMoney(owed[c].open, c) }}</span>
          <span v-if="owed[c].overdueCount" class="text-sm text-red-700 dark:text-red-300"><i class="pi pi-exclamation-triangle mr-1" />{{ t('iv.overdueSum', { n: owed[c].overdueCount, amount: formatMoney(owed[c].overdue, c) }) }}</span>
        </div>
      </template>
    </div>

    <p v-if="!currencies.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('iv.noReport') }}</p>
    <section v-for="c in currencies" :key="c" class="card overflow-x-auto">
      <h2 class="mb-2 font-semibold">{{ t('iv.reportIn', { cur: c }) }}</h2>
      <table class="w-full min-w-[28rem] text-sm tabular-nums">
        <thead class="text-left text-[var(--k-muted)]">
          <tr>
            <th class="py-1 font-normal">{{ t('iv.month') }}</th>
            <th class="py-1 text-right font-normal">{{ t('iv.nav.invoices') }}</th>
            <th class="py-1 text-right font-normal">{{ t('iv.invoiced') }}</th>
            <th class="py-1 text-right font-normal">{{ t('iv.vat') }}</th>
            <th class="py-1 text-right font-normal">{{ t('iv.received') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in of(c)" :key="r.month" class="border-t border-[var(--k-border)]">
            <td class="py-1.5">{{ monthName(r.month) }}</td>
            <td class="py-1.5 text-right">{{ r.invoices }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(r.invoiced, c) }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(r.vat, c) }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(r.received, c) }}</td>
          </tr>
          <tr class="border-t-2 border-[var(--k-border)] font-semibold">
            <td class="py-1.5">{{ year }}</td>
            <td class="py-1.5 text-right">{{ sum(c, 'invoices') }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(sum(c, 'invoiced'), c) }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(sum(c, 'vat'), c) }}</td>
            <td class="py-1.5 text-right">{{ formatMoney(sum(c, 'received'), c) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <p class="text-xs text-[var(--k-muted)]">{{ t('iv.reportNote') }}</p>
  </div>
</template>
