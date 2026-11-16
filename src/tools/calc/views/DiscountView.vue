<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import AmountField from '@/components/AmountField.vue'
import { persisted } from '@/tools/finance/state'
import { discount } from '../calc'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const f = persisted('calc.discount', {
  price: 20_000,
  currency: 'KHR' as 'KHR' | 'USD',
  kind1: 'pct' as 'pct' | 'amount',
  v1: 10,
  second: false,
  kind2: 'pct' as 'pct' | 'amount',
  v2: 10,
})
const val = (kind: 'pct' | 'amount', v: number) => (kind === 'amount' ? (f.currency === 'USD' ? Math.round(v * 100) : v) : v)
const r = computed(() => discount(f.price, { kind: f.kind1, value: val(f.kind1, f.v1 || 0) }, f.second ? { kind: f.kind2, value: val(f.kind2, f.v2 || 0) } : null))
const m = (v: number) => formatMoney(v, f.currency)
const kinds = computed(() => [
  { label: '%', value: 'pct' },
  { label: f.currency === 'KHR' ? '៛' : '$', value: 'amount' },
])
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <section class="card flex flex-col gap-3">
      <div class="field">
        <span>{{ t('calc.disc.price') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.price" :currency="f.currency" class="flex-1" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <div class="field">
        <span>{{ t('calc.disc.discount') }}</span>
        <div class="flex gap-2">
          <InputNumber v-model="f.v1" :min="0" :max-fraction-digits="2" class="flex-1" input-class="w-full" />
          <SelectButton v-model="f.kind1" :options="kinds" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.second" /> {{ t('calc.disc.second') }}</label>
      <div v-if="f.second" class="flex gap-2">
        <InputNumber v-model="f.v2" :min="0" :max-fraction-digits="2" class="flex-1" input-class="w-full" />
        <SelectButton v-model="f.kind2" :options="kinds" option-label="label" option-value="value" :allow-empty="false" />
      </div>
    </section>
    <section class="card flex flex-col gap-2">
      <div class="text-sm text-[var(--k-muted)]">{{ t('calc.disc.pay') }}</div>
      <div class="text-3xl font-bold text-primary-600 tabular-nums dark:text-primary-400">{{ m(r.final) }}</div>
      <div class="text-[var(--k-muted)]">{{ t('calc.disc.saved', { amount: m(r.saved), pct: r.pct.toFixed(1) }) }}</div>
      <p v-if="f.second && f.kind1 === 'pct' && f.kind2 === 'pct'" class="mt-2 text-xs text-[var(--k-muted)]">{{ t('calc.disc.stackNote') }}</p>
    </section>
  </div>
</template>
