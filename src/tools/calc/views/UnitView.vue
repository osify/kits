<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import AmountField from '@/components/AmountField.vue'
import { persisted } from '@/tools/finance/state'
import { unitPrices } from '../calc'
import { formatMoney } from '@/core/util/money'

/** Which pack is cheaper per gram / ml / piece? */
const { t } = useI18n()
const f = persisted('calc.unit', {
  currency: 'KHR' as 'KHR' | 'USD',
  unit: 'ml',
  options: [
    { label: 'A', price: 2_500, qty: 330 },
    { label: 'B', price: 6_000, qty: 1_000 },
  ],
})
const r = computed(() => unitPrices(f.options))
const perHundred = (v: number) => (Number.isFinite(v) ? formatMoney(Math.round(v * 100), f.currency) : '–')
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
function add() {
  f.options.push({ label: String.fromCharCode(65 + f.options.length), price: 0, qty: 0 })
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
      <label class="flex items-center gap-2 text-sm">{{ t('calc.unit.unit') }} <InputText v-model="f.unit" class="w-24" placeholder="g / ml / pcs" /></label>
    </div>
    <div v-for="(o, i) in f.options" :key="i" class="card grid items-end gap-3 sm:grid-cols-[4rem_1fr_1fr_auto]" :class="{ '!border-primary-600': r[i]?.best }">
      <label class="field"><span>{{ t('calc.unit.name') }}</span><InputText v-model="o.label" /></label>
      <label class="field"><span>{{ t('calc.unit.price') }}</span><AmountField v-model="o.price" :currency="f.currency" /></label>
      <label class="field"><span>{{ t('calc.unit.qty', { unit: f.unit }) }}</span><InputNumber v-model="o.qty" :min="0" :max-fraction-digits="2" class="w-full" input-class="w-full" /></label>
      <Button v-if="f.options.length > 2" icon="pi pi-times" text severity="danger" :aria-label="t('calc.unit.remove')" @click="f.options.splice(i, 1)" />
      <div class="flex flex-wrap items-center gap-2 text-sm sm:col-span-4">
        <span>{{ t('calc.unit.per100', { unit: f.unit }) }}: <b class="tabular-nums">{{ perHundred(r[i]?.perUnit ?? NaN) }}</b></span>
        <Tag v-if="r[i]?.best" severity="success" icon="pi pi-check" :value="t('calc.unit.best')" />
        <span v-else-if="Number.isFinite(r[i]?.moreThanBestPct)" class="text-amber-700 dark:text-amber-400">{{ t('calc.unit.more', { pct: r[i].moreThanBestPct.toFixed(0) }) }}</span>
      </div>
    </div>
    <Button v-if="f.options.length < 6" :label="t('calc.unit.add')" icon="pi pi-plus" text class="self-start" @click="add" />
  </div>
</template>
