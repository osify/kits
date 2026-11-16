<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import MoneyField from '../components/MoneyField.vue'
import Stat from '../components/Stat.vue'
import SplitBar from '../components/SplitBar.vue'
import { currency, persisted, RIEL_STEP } from '../state'
import { loan, type LoanMethod, type RateUnit } from '../calc'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

const { t } = useI18n()
const DEFAULTS = { KHR: 12_000_000, USD: 300_000 }
const f = persisted('loan', {
  amount: DEFAULTS[currency.value],
  rate: 1.5,
  rateUnit: 'month' as RateUnit,
  months: 12,
  method: 'annuity' as LoanMethod,
  feePct: 0,
  start: today(),
})
watch(currency, (c) => (f.amount = DEFAULTS[c]))

const methods = computed(() => [
  { label: t('fin.loan.annuity'), value: 'annuity' },
  { label: t('fin.loan.principal'), value: 'principal' },
  { label: t('fin.loan.flat'), value: 'flat' },
])
const units = computed(() => [
  { label: t('fin.loan.perMonth'), value: 'month' },
  { label: t('fin.loan.perYear'), value: 'year' },
])
const startDate = computed({
  get: () => (f.start ? new Date(f.start + 'T00:00:00') : null),
  set: (d: Date | null) => (f.start = d ? today(d) : ''),
})

const r = computed(() =>
  loan({ amount: f.amount, currency: currency.value, rate: f.rate || 0, rateUnit: f.rateUnit, months: f.months || 1, method: f.method, feePct: f.feePct || 0, start: f.start || undefined, rielStep: RIEL_STEP }),
)
const m = (v: number) => formatMoney(v, currency.value)
const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : '–')
const sameEvery = computed(() => r.value.firstPayment === r.value.lastPayment || (f.method === 'annuity' && r.value.rows.length > 1))
const flatWarn = computed(() => f.method === 'flat' && f.rate > 0)

const printPage = () => window.print()

function exportCsv() {
  const money = (v: number) => (currency.value === 'USD' ? (v / 100).toFixed(2) : String(v))
  const head = ['no', 'date', 'payment', 'principal', 'interest', 'balance']
  const body = r.value.rows.map((x) => [x.n, x.date ?? '', money(x.payment), money(x.principal), money(x.interest), money(x.balance)].join(','))
  const csv = '﻿' + [head.join(','), ...body].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-loan-${f.months}m.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[22rem_1fr]">
    <section class="no-print flex flex-col gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 lg:self-start">
      <label class="field"><span>{{ t('fin.loan.amount') }}</span><MoneyField v-model="f.amount" /></label>
      <div class="grid grid-cols-[1fr_auto] items-end gap-2">
        <label class="field">
          <span>{{ t('fin.loan.rate') }}</span>
          <InputNumber v-model="f.rate" :min="0" :max="100" :max-fraction-digits="3" suffix=" %" class="w-full" input-class="w-full" />
        </label>
        <SelectButton v-model="f.rateUnit" :options="units" option-label="label" option-value="value" :allow-empty="false" size="small" />
      </div>
      <label class="field">
        <span>{{ t('fin.loan.months') }}</span>
        <InputNumber v-model="f.months" :min="1" :max="480" show-buttons class="w-full" input-class="w-full" />
      </label>
      <div class="field">
        <span>{{ t('fin.loan.method') }}</span>
        <SelectButton v-model="f.method" :options="methods" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
        <small class="text-[var(--k-muted)]">{{ t(`fin.loan.${f.method}Hint`) }}</small>
      </div>
      <label class="field">
        <span>{{ t('fin.loan.fee') }} <small class="text-[var(--k-muted)]">({{ t('fin.optional') }})</small></span>
        <InputNumber v-model="f.feePct" :min="0" :max="50" :max-fraction-digits="2" suffix=" %" class="w-full" input-class="w-full" />
      </label>
      <label class="field">
        <span>{{ t('fin.loan.start') }}</span>
        <DatePicker v-model="startDate" date-format="yy-mm-dd" show-icon class="w-full" />
      </label>
    </section>

    <section class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat hero :label="sameEvery ? t('fin.loan.monthly') : t('fin.loan.firstPayment')" :value="m(r.firstPayment)" :sub="!sameEvery ? `${t('fin.loan.lastPayment')}: ${m(r.lastPayment)}` : undefined" />
        <Stat :label="t('fin.loan.totalInterest')" :value="m(r.totalInterest)" tone="warn" />
        <Stat :label="t('fin.loan.totalPaid')" :value="m(r.totalPaid + r.fee)" :sub="r.fee ? `${t('fin.loan.feeAmount')}: ${m(r.fee)}` : undefined" />
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat :label="t('fin.loan.effMonthly')" :value="pct(r.effMonthly)" :sub="t('fin.loan.effMonthlySub')" />
        <Stat :label="t('fin.loan.effAnnual')" :value="pct(r.effAnnual)" :sub="t('fin.loan.effAnnualSub')" />
        <Stat :label="t('fin.loan.received')" :value="m(r.received)" />
      </div>

      <Message v-if="flatWarn" severity="warn" :closable="false">
        {{ t('fin.loan.flatWarn', { flat: f.rate, real: pct(r.effMonthly) }) }}
      </Message>

      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <h2 class="mb-3 font-semibold">{{ t('fin.loan.whereMoneyGoes') }}</h2>
        <SplitBar
          :label="t('fin.loan.whereMoneyGoes')"
          :parts="[
            { label: t('fin.loan.principalPart'), value: f.amount, text: m(f.amount) },
            { label: t('fin.loan.interestPart'), value: r.totalInterest + r.fee, text: m(r.totalInterest + r.fee) },
          ]"
        />
      </div>

      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <div class="no-print flex items-center gap-2 px-4 pt-3">
          <h2 class="flex-1 font-semibold">{{ t('fin.loan.schedule') }}</h2>
          <Button icon="pi pi-file-excel" :label="t('fin.csv')" size="small" text @click="exportCsv" />
          <Button icon="pi pi-print" :label="t('fin.print')" size="small" text @click="printPage" />
        </div>
        <h2 class="hidden px-4 pt-3 font-semibold print:block">{{ t('fin.loan.schedule') }}</h2>
        <div class="max-h-[32rem] overflow-auto print:max-h-none">
          <table class="w-full text-sm tabular-nums">
            <thead class="sticky top-0 bg-[var(--k-surface)] text-left text-[var(--k-muted)]">
              <tr>
                <th class="px-4 py-2 font-normal">#</th>
                <th class="px-2 py-2 font-normal">{{ t('fin.loan.date') }}</th>
                <th class="px-2 py-2 text-right font-normal">{{ t('fin.loan.payment') }}</th>
                <th class="px-2 py-2 text-right font-normal">{{ t('fin.loan.principalPart') }}</th>
                <th class="px-2 py-2 text-right font-normal">{{ t('fin.loan.interestPart') }}</th>
                <th class="px-4 py-2 text-right font-normal">{{ t('fin.loan.balance') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="x in r.rows" :key="x.n" class="border-t border-[var(--k-border)]">
                <td class="px-4 py-1.5">{{ x.n }}</td>
                <td class="px-2 py-1.5">{{ x.date }}</td>
                <td class="px-2 py-1.5 text-right font-semibold">{{ m(x.payment) }}</td>
                <td class="px-2 py-1.5 text-right">{{ m(x.principal) }}</td>
                <td class="px-2 py-1.5 text-right">{{ m(x.interest) }}</td>
                <td class="px-4 py-1.5 text-right">{{ m(x.balance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
</style>
