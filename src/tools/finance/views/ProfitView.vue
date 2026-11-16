<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import MoneyField from '../components/MoneyField.vue'
import Stat from '../components/Stat.vue'
import { currency, persisted, step } from '../state'
import { priceForMargin, priceForMarkup, profitFromPrice } from '../calc'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const DEFAULTS = { KHR: { cost: 3_000, price: 5_000 }, USD: { cost: 75, price: 125 } }
const f = persisted('profit', { mode: 'price' as 'price' | 'margin' | 'markup', ...DEFAULTS[currency.value], target: 40, qty: 100 })
watch(currency, (c) => Object.assign(f, DEFAULTS[c]))

const modes = computed(() => [
  { label: t('fin.pro.fromPrice'), value: 'price' },
  { label: t('fin.pro.forMargin'), value: 'margin' },
  { label: t('fin.pro.forMarkup'), value: 'markup' },
])
const r = computed(() =>
  f.mode === 'price' ? profitFromPrice(f.cost, f.price) : f.mode === 'margin' ? priceForMargin(f.cost, f.target || 0, step()) : priceForMarkup(f.cost, f.target || 0, step()),
)
const m = (v: number) => formatMoney(v, currency.value)
const loss = computed(() => r.value.profit < 0)
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[22rem_1fr]">
    <section class="flex flex-col gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 lg:self-start">
      <SelectButton v-model="f.mode" :options="modes" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
      <label class="field"><span>{{ t('fin.pro.cost') }}</span><MoneyField v-model="f.cost" /></label>
      <label v-if="f.mode === 'price'" class="field"><span>{{ t('fin.pro.price') }}</span><MoneyField v-model="f.price" /></label>
      <label v-else class="field">
        <span>{{ f.mode === 'margin' ? t('fin.pro.targetMargin') : t('fin.pro.targetMarkup') }}</span>
        <InputNumber v-model="f.target" :min="0" :max="f.mode === 'margin' ? 99 : 1000" :max-fraction-digits="2" suffix=" %" class="w-full" input-class="w-full" />
      </label>
      <label class="field">
        <span>{{ t('fin.pro.qty') }}</span>
        <InputNumber v-model="f.qty" :min="0" show-buttons class="w-full" input-class="w-full" />
      </label>
      <p class="text-xs text-[var(--k-muted)]">{{ t('fin.pro.hint') }}</p>
    </section>

    <section class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat hero :label="f.mode === 'price' ? t('fin.pro.profitEach') : t('fin.pro.sellAt')" :value="f.mode === 'price' ? m(r.profit) : m(r.price)" :tone="loss ? 'warn' : 'good'" :sub="f.mode !== 'price' ? `${t('fin.pro.profitEach')}: ${m(r.profit)}` : undefined" />
        <Stat :label="t('fin.pro.margin')" :value="`${r.margin.toFixed(1)}%`" :sub="t('fin.pro.marginSub')" />
        <Stat :label="t('fin.pro.markup')" :value="`${r.markup.toFixed(1)}%`" :sub="t('fin.pro.markupSub')" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <Stat :label="t('fin.pro.revenueFor', { n: f.qty })" :value="m(r.price * f.qty)" />
        <Stat :label="t('fin.pro.profitFor', { n: f.qty })" :value="m(r.profit * f.qty)" :tone="loss ? 'warn' : 'good'" />
      </div>
      <p v-if="loss" class="text-sm text-amber-600">{{ t('fin.pro.loss') }}</p>
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
