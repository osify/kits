<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { persisted } from '@/tools/finance/state'
import { cashTotal, RIEL_NOTES, USD_NOTES } from '../calc'
import { formatMoney } from '@/core/util/money'

/** Count the cash drawer: how many of each note → totals in riel and dollars. */
const { t } = useI18n()
const f = persisted('calc.cash', { riel: {} as Record<number, number>, usd: {} as Record<number, number>, rate: 4100 })
const r = computed(() => cashTotal({ riel: f.riel, usd: f.usd }, f.rate || 4100))
const reset = () => Object.assign(f, { riel: {}, usd: {} })
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[1fr_1fr_18rem]">
    <section class="card">
      <h2 class="mb-3 font-semibold">{{ t('calc.cash.riel') }}</h2>
      <div v-for="n in RIEL_NOTES" :key="n" class="row">
        <span class="w-24 tabular-nums">{{ n.toLocaleString('en-US') }} ៛</span>
        <span class="text-[var(--k-muted)]">×</span>
        <InputNumber v-model="f.riel[n]" :min="0" show-buttons button-layout="horizontal" increment-button-icon="pi pi-plus" decrement-button-icon="pi pi-minus" :input-id="`r${n}`" class="w-36" input-class="w-14 text-center" :aria-label="`${n} ៛`" />
        <span class="ml-auto text-sm tabular-nums text-[var(--k-muted)]">{{ (n * (f.riel[n] || 0)).toLocaleString('en-US') }}</span>
      </div>
    </section>
    <section class="card">
      <h2 class="mb-3 font-semibold">{{ t('calc.cash.usd') }}</h2>
      <div v-for="n in USD_NOTES" :key="n" class="row">
        <span class="w-24 tabular-nums">${{ n }}</span>
        <span class="text-[var(--k-muted)]">×</span>
        <InputNumber v-model="f.usd[n]" :min="0" show-buttons button-layout="horizontal" increment-button-icon="pi pi-plus" decrement-button-icon="pi pi-minus" :input-id="`u${n}`" class="w-36" input-class="w-14 text-center" :aria-label="`$${n}`" />
        <span class="ml-auto text-sm tabular-nums text-[var(--k-muted)]">${{ n * (f.usd[n] || 0) }}</span>
      </div>
      <label class="mt-3 flex flex-col gap-1 text-sm"><span>{{ t('calc.rate') }}</span><InputNumber v-model="f.rate" :min="1000" :max="10000" suffix=" ៛" /></label>
    </section>
    <section class="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
      <div class="card">
        <div class="text-sm text-[var(--k-muted)]">{{ t('calc.cash.total') }}</div>
        <div class="text-3xl font-bold text-primary-600 tabular-nums dark:text-primary-400">{{ formatMoney(Math.round(r.totalRiel), 'KHR') }}</div>
        <div class="text-sm text-[var(--k-muted)]">≈ ${{ r.totalUsd.toFixed(2) }}</div>
      </div>
      <div class="card text-sm">
        <div class="flex justify-between"><span>{{ t('calc.cash.riel') }}</span><b class="tabular-nums">{{ formatMoney(r.riel, 'KHR') }}</b></div>
        <div class="flex justify-between"><span>{{ t('calc.cash.usd') }}</span><b class="tabular-nums">${{ r.usd }}</b></div>
        <div class="flex justify-between text-[var(--k-muted)]"><span>{{ t('calc.cash.notes') }}</span><span>{{ r.notes }}</span></div>
      </div>
      <Button :label="t('calc.clear')" icon="pi pi-eraser" outlined @click="reset" />
    </section>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0;
}
</style>
