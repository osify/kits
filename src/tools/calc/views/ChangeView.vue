<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import AmountField from '@/components/AmountField.vue'
import { persisted } from '@/tools/finance/state'
import { change } from '../calc'
import { formatMoney } from '@/core/util/money'

/** Customer pays in dollars and/or riel: how much change, in riel or dollars + riel. */
const { t } = useI18n()
const f = persisted('calc.change', { due: 26_500, dueCurrency: 'KHR' as 'KHR' | 'USD', paidUsd: 1_000, paidKhr: 0, rate: 4100 })
const r = computed(() => change({ ...f, rate: f.rate || 4100 }))
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
const usdNotes = [1, 5, 10, 20, 50, 100]
const rielNotes = [1000, 5000, 10000, 20000, 50000, 100000]
const clear = () => Object.assign(f, { paidUsd: 0, paidKhr: 0 })
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <section class="card flex flex-col gap-3">
      <div class="field">
        <span>{{ t('calc.change.due') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.due" :currency="f.dueCurrency" class="flex-1" />
          <SelectButton v-model="f.dueCurrency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <div class="field">
        <span>{{ t('calc.change.paidUsd') }}</span>
        <AmountField v-model="f.paidUsd" currency="USD" />
        <div class="flex flex-wrap gap-1.5">
          <Button v-for="n in usdNotes" :key="n" :label="`+$${n}`" size="small" outlined severity="secondary" @click="f.paidUsd += n * 100" />
        </div>
      </div>
      <div class="field">
        <span>{{ t('calc.change.paidKhr') }}</span>
        <AmountField v-model="f.paidKhr" currency="KHR" />
        <div class="flex flex-wrap gap-1.5">
          <Button v-for="n in rielNotes" :key="n" :label="`+${n.toLocaleString('en-US')}`" size="small" outlined severity="secondary" @click="f.paidKhr += n" />
        </div>
      </div>
      <div class="flex items-end gap-2">
        <label class="field flex-1"><span>{{ t('calc.rate') }}</span><InputNumber v-model="f.rate" :min="1000" :max="10000" suffix=" ៛" class="w-full" input-class="w-full" /></label>
        <Button :label="t('calc.clear')" icon="pi pi-eraser" text @click="clear" />
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <div class="card">
        <div class="text-sm text-[var(--k-muted)]">{{ t('calc.change.paid') }}</div>
        <div class="text-lg font-semibold tabular-nums">{{ formatMoney(r.paidRiel, 'KHR') }} <span class="text-sm font-normal text-[var(--k-muted)]">/ {{ formatMoney(r.dueRiel, 'KHR') }}</span></div>
      </div>
      <div v-if="r.short" class="card border-red-600/50">
        <div class="text-sm text-[var(--k-muted)]">{{ t('calc.change.stillOwes') }}</div>
        <div class="text-3xl font-bold text-red-600 tabular-nums">{{ formatMoney(-r.diffRiel, 'KHR') }}</div>
      </div>
      <template v-else>
        <div class="card">
          <div class="text-sm text-[var(--k-muted)]">{{ t('calc.change.giveRiel') }}</div>
          <div class="text-3xl font-bold text-primary-600 tabular-nums dark:text-primary-400">{{ formatMoney(r.changeRiel, 'KHR') }}</div>
        </div>
        <div v-if="r.mixUsd > 0" class="card">
          <div class="text-sm text-[var(--k-muted)]">{{ t('calc.change.orMixed') }}</div>
          <div class="text-2xl font-bold tabular-nums">${{ r.mixUsd }} + {{ formatMoney(r.mixRiel, 'KHR') }}</div>
        </div>
      </template>
      <p class="text-xs text-[var(--k-muted)]">{{ t('calc.change.note') }}</p>
    </section>
  </div>
</template>
