<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import MoneyField from '../components/MoneyField.vue'
import Stat from '../components/Stat.vue'
import SplitBar from '../components/SplitBar.vue'
import { currency, persisted } from '../state'
import { savings } from '../calc'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const DEFAULTS = { KHR: { initial: 4_000_000, monthly: 400_000 }, USD: { initial: 100_000, monthly: 10_000 } }
const f = persisted('savings', { ...DEFAULTS[currency.value], rate: 5, months: 24, taxPct: 0 })
watch(currency, (c) => Object.assign(f, DEFAULTS[c]))

const r = computed(() => savings({ initial: f.initial, monthly: f.monthly, rate: f.rate || 0, months: f.months || 1, taxPct: f.taxPct || 0 }))
const m = (v: number) => formatMoney(currency.value === 'KHR' ? Math.round(v / 100) * 100 : v, currency.value)
const yearly = computed(() => r.value.rows.filter((x) => x.n % 12 === 0 || x.n === r.value.rows.length))
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[22rem_1fr]">
    <section class="no-print flex flex-col gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 lg:self-start">
      <label class="field"><span>{{ t('fin.sav.initial') }}</span><MoneyField v-model="f.initial" /></label>
      <label class="field"><span>{{ t('fin.sav.monthly') }}</span><MoneyField v-model="f.monthly" /></label>
      <label class="field">
        <span>{{ t('fin.sav.rate') }}</span>
        <InputNumber v-model="f.rate" :min="0" :max="100" :max-fraction-digits="3" suffix=" %" class="w-full" input-class="w-full" />
      </label>
      <label class="field">
        <span>{{ t('fin.sav.months') }}</span>
        <InputNumber v-model="f.months" :min="1" :max="600" show-buttons class="w-full" input-class="w-full" />
      </label>
      <label class="field">
        <span>{{ t('fin.sav.tax') }} <small class="text-[var(--k-muted)]">({{ t('fin.optional') }})</small></span>
        <InputNumber v-model="f.taxPct" :min="0" :max="100" :max-fraction-digits="2" suffix=" %" class="w-full" input-class="w-full" />
        <small class="text-[var(--k-muted)]">{{ t('fin.sav.taxHint') }}</small>
      </label>
    </section>

    <section class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat hero :label="t('fin.sav.final', { n: f.months })" :value="m(r.final)" tone="good" />
        <Stat :label="t('fin.sav.deposited')" :value="m(r.deposited)" />
        <Stat :label="t('fin.sav.interest')" :value="m(r.net)" :sub="r.tax ? `${t('fin.sav.taxPaid')}: ${m(r.tax)}` : undefined" tone="good" />
      </div>
      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <h2 class="mb-3 font-semibold">{{ t('fin.sav.makeup') }}</h2>
        <SplitBar
          :label="t('fin.sav.makeup')"
          :parts="[
            { label: t('fin.sav.deposited'), value: r.deposited, text: m(r.deposited) },
            { label: t('fin.sav.interest'), value: r.net, text: m(r.net) },
          ]"
        />
      </div>
      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <h2 class="px-4 pt-3 font-semibold">{{ t('fin.sav.byYear') }}</h2>
        <table class="w-full text-sm tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr>
              <th class="px-4 py-2 font-normal">{{ t('fin.sav.month') }}</th>
              <th class="px-4 py-2 text-right font-normal">{{ t('fin.sav.balance') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in yearly" :key="x.n" class="border-t border-[var(--k-border)]">
              <td class="px-4 py-1.5">{{ x.n }}</td>
              <td class="px-4 py-1.5 text-right font-semibold">{{ m(x.balance) }}</td>
            </tr>
          </tbody>
        </table>
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
