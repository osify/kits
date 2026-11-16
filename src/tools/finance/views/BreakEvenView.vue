<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import MoneyField from '../components/MoneyField.vue'
import Stat from '../components/Stat.vue'
import { currency, persisted } from '../state'
import { breakEven } from '../calc'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const DEFAULTS = { KHR: { fixed: 3_000_000, price: 5_000, variable: 2_000 }, USD: { fixed: 75_000, price: 125, variable: 50 } }
const f = persisted('breakeven', { ...DEFAULTS[currency.value], days: 30 })
watch(currency, (c) => Object.assign(f, DEFAULTS[c]))

const r = computed(() => breakEven(f.fixed, f.price, f.variable, f.days || 30))
const m = (v: number) => formatMoney(v, currency.value)
const n = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-US') : '∞')
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[22rem_1fr]">
    <section class="flex flex-col gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 lg:self-start">
      <label class="field">
        <span>{{ t('fin.be.fixed') }}</span>
        <MoneyField v-model="f.fixed" />
        <small class="text-[var(--k-muted)]">{{ t('fin.be.fixedHint') }}</small>
      </label>
      <label class="field"><span>{{ t('fin.be.price') }}</span><MoneyField v-model="f.price" /></label>
      <label class="field">
        <span>{{ t('fin.be.variable') }}</span>
        <MoneyField v-model="f.variable" />
        <small class="text-[var(--k-muted)]">{{ t('fin.be.variableHint') }}</small>
      </label>
      <label class="field">
        <span>{{ t('fin.be.days') }}</span>
        <InputNumber v-model="f.days" :min="1" :max="31" show-buttons class="w-full" input-class="w-full" />
      </label>
    </section>

    <section class="flex flex-col gap-4">
      <Message v-if="!r.possible" severity="warn" :closable="false">{{ t('fin.be.impossible') }}</Message>
      <template v-else>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat hero :label="t('fin.be.perDay')" :value="n(r.unitsDay)" :sub="t('fin.be.perDaySub', { days: f.days })" tone="good" />
          <Stat :label="t('fin.be.perMonth')" :value="n(r.unitsMonth)" />
          <Stat :label="t('fin.be.revenue')" :value="m(r.revenueMonth)" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <Stat :label="t('fin.be.contribution')" :value="m(r.contribution)" :sub="t('fin.be.contributionSub')" />
        </div>
        <p class="text-sm text-[var(--k-muted)]">{{ t('fin.be.explain', { units: n(r.unitsMonth), fixed: m(f.fixed) }) }}</p>
      </template>
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
