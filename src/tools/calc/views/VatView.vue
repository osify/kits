<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import AmountField from '@/components/AmountField.vue'
import { persisted } from '@/tools/finance/state'
import { vat } from '../calc'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const f = persisted('calc.vat', { amount: 10_000, currency: 'KHR' as 'KHR' | 'USD', rate: 10, mode: 'add' as 'add' | 'remove' })
const r = computed(() => vat(f.amount, f.rate || 0, f.mode))
const m = (v: number) => formatMoney(v, f.currency)
const modes = computed(() => [
  { label: t('calc.vat.add'), value: 'add' },
  { label: t('calc.vat.remove'), value: 'remove' },
])
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <section class="card flex flex-col gap-3">
      <SelectButton v-model="f.mode" :options="modes" option-label="label" option-value="value" :allow-empty="false" />
      <div class="field">
        <span>{{ f.mode === 'add' ? t('calc.vat.priceExcl') : t('calc.vat.priceIncl') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.amount" :currency="f.currency" class="flex-1" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <label class="field"><span>{{ t('calc.vat.rate') }}</span><InputNumber v-model="f.rate" :min="0" :max="100" :max-fraction-digits="2" suffix=" %" /></label>
      <p class="text-xs text-[var(--k-muted)]">{{ t('calc.vat.note') }}</p>
    </section>
    <section class="card flex flex-col gap-2 text-lg">
      <div class="flex justify-between"><span>{{ t('calc.vat.net') }}</span><b class="tabular-nums">{{ m(r.net) }}</b></div>
      <div class="flex justify-between"><span>{{ t('calc.vat.tax', { rate: f.rate }) }}</span><b class="tabular-nums">{{ m(r.tax) }}</b></div>
      <div class="flex justify-between border-t border-[var(--k-border)] pt-2 text-2xl">
        <span>{{ t('calc.vat.gross') }}</span><b class="text-primary-600 tabular-nums dark:text-primary-400">{{ m(r.gross) }}</b>
      </div>
    </section>
  </div>
</template>
