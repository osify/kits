<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import { db } from '../db'
import { incomeByDay, incomeByDoctor, visitsCsv, type DayIncome, type DoctorIncome } from '../db/data'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** Visits and money by day for a month; Excel export of visits (fees only, no medical notes). */
const { t } = useI18n()
const cl = useClinic()
const month = ref(new Date())
const range = computed(() => {
  const d = month.value
  const from = today(new Date(d.getFullYear(), d.getMonth(), 1))
  const to = today(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  return { from, to }
})
const rows = ref<DayIncome[]>([])
const byDoctor = ref<DoctorIncome[]>([])
const load = async () => {
  ;[rows.value, byDoctor.value] = await Promise.all([incomeByDay(db, range.value.from, range.value.to), incomeByDoctor(db, range.value.from, range.value.to)])
}
onMounted(load)
watch(range, load)
const m = (v: number) => formatMoney(v, cl.currency)
const sum = computed(() => ({
  visits: rows.value.reduce((s, r) => s + r.visits, 0),
  billed: rows.value.reduce((s, r) => s + r.billed, 0),
  received: rows.value.reduce((s, r) => s + r.received, 0),
}))
async function exportCsv() {
  const csv = await visitsCsv(db, range.value.from, range.value.to, cl.currency)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-clinic-${range.value.from.slice(0, 7)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('cl.nav.report') }}</h1>
      <DatePicker v-model="month" view="month" date-format="yy-mm" show-icon class="w-36" :aria-label="t('tt.month')" />
      <Button :label="t('tt.excel')" icon="pi pi-file-excel" outlined @click="exportCsv" />
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('cl.visitsLabel') }}</div><div class="text-lg font-semibold">{{ sum.visits }}</div></div>
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('cl.billed') }}</div><div class="text-lg font-semibold tabular-nums">{{ m(sum.billed) }}</div></div>
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('cl.received') }}</div><div class="text-lg font-semibold tabular-nums">{{ m(sum.received) }}</div></div>
      <div class="card">
        <div class="text-xs text-[var(--k-muted)]">{{ t('cl.unpaid') }}</div>
        <div class="text-lg font-semibold tabular-nums" :class="sum.billed > sum.received ? 'text-amber-700 dark:text-amber-400' : ''">{{ m(Math.max(0, sum.billed - sum.received)) }}</div>
      </div>
    </div>
    <div v-if="byDoctor.length > 1 || byDoctor.some((d) => d.doctor_id)" class="card overflow-x-auto !p-0">
      <table class="w-full text-sm whitespace-nowrap tabular-nums">
        <thead class="text-left text-[var(--k-muted)]">
          <tr>
            <th class="px-3 py-2 font-normal">{{ t('cl.sch.doctor') }}</th>
            <th class="py-2 text-right font-normal">{{ t('cl.visitsLabel') }}</th>
            <th class="py-2 text-right font-normal">{{ t('cl.billed') }}</th>
            <th class="px-3 py-2 text-right font-normal">{{ t('cl.received') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in byDoctor" :key="d.doctor_id ?? '_'" class="border-t border-[var(--k-border)]">
            <td class="px-3 py-2">
              <span class="mr-1.5 inline-block size-2 rounded-full" :style="{ background: cl.doctor(d.doctor_id)?.color ?? '#64748b' }" />{{ cl.doctor(d.doctor_id)?.name ?? t('cl.sch.anyDoctor') }}
            </td>
            <td class="py-2 text-right">{{ d.visits }}</td>
            <td class="py-2 text-right">{{ m(d.billed) }}</td>
            <td class="px-3 py-2 text-right">{{ m(d.received) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card overflow-x-auto !p-0">
      <table class="w-full text-sm whitespace-nowrap tabular-nums">
        <thead class="text-left text-[var(--k-muted)]">
          <tr>
            <th class="px-3 py-2 font-normal">{{ t('hl.date') }}</th>
            <th class="py-2 text-right font-normal">{{ t('cl.visitsLabel') }}</th>
            <th class="py-2 text-right font-normal">{{ t('cl.billed') }}</th>
            <th class="px-3 py-2 text-right font-normal">{{ t('cl.received') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length"><td colspan="4" class="px-3 py-6 text-center text-[var(--k-muted)]">{{ t('cl.noVisits') }}</td></tr>
          <tr v-for="r in rows" :key="r.date" class="border-t border-[var(--k-border)]">
            <td class="px-3 py-2">{{ r.date }}</td>
            <td class="py-2 text-right">{{ r.visits }}</td>
            <td class="py-2 text-right">{{ m(r.billed) }}</td>
            <td class="px-3 py-2 text-right">{{ m(r.received) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-[var(--k-muted)]"><i class="pi pi-shield mr-1" />{{ t('cl.csvNoMedical') }}</p>
  </div>
</template>
