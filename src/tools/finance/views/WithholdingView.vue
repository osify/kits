<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import AmountField from '@/components/AmountField.vue'
import RatesNote from '../components/RatesNote.vue'
import { persisted } from '../state'
import { withholding } from '../tax'
import { WITHHOLDING, type WithholdingKey } from '../rates'
import { formatMoney } from '@/core/util/money'

/** Withholding tax on rent, services, interest… (from the gross, or grossed up from the net). */
const { t } = useI18n()
const f = persisted('wht', { kind: 'rent' as WithholdingKey, amount: 1_000_000, currency: 'KHR' as 'KHR' | 'USD', mode: 'gross' as 'gross' | 'net' })
const rate = computed(() => WITHHOLDING.find((w) => w.key === f.kind)?.rate ?? 0)
const r = computed(() => withholding(f.amount, rate.value, f.mode))
const m = (v: number) => formatMoney(v, f.currency)
const modes = computed(() => [
  { label: t('fin.wht.fromGross'), value: 'gross' },
  { label: t('fin.wht.fromNet'), value: 'net' },
])
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[24rem_1fr]">
    <section class="card flex flex-col gap-3 lg:self-start">
      <div class="field">
        <span>{{ t('fin.wht.payment') }}</span>
        <div class="flex flex-col gap-1">
          <button
            v-for="w in WITHHOLDING"
            :key="w.key"
            type="button"
            class="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
            :class="f.kind === w.key ? 'border-primary-600 bg-primary-50 dark:bg-primary-950' : 'border-[var(--k-border)]'"
            :aria-pressed="f.kind === w.key"
            @click="f.kind = w.key"
          >
            <span>{{ t(`fin.wht.kind.${w.key}`) }}</span>
            <b class="tabular-nums">{{ w.rate }}%</b>
          </button>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <div class="card flex flex-col gap-3">
        <SelectButton v-model="f.mode" :options="modes" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
        <div class="field">
          <span>{{ f.mode === 'gross' ? t('fin.wht.grossAmount') : t('fin.wht.netAmount') }}</span>
          <div class="flex gap-2">
            <AmountField v-model="f.amount" :currency="f.currency" class="flex-1" />
            <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
          </div>
        </div>
      </div>
      <div class="card">
        <dl class="grid grid-cols-[1fr_auto] gap-y-2 text-lg tabular-nums">
          <dt>{{ t('fin.wht.gross') }}</dt><dd class="text-right font-semibold">{{ m(r.gross) }}</dd>
          <dt>{{ t('fin.wht.tax', { rate }) }}</dt><dd class="text-right font-semibold text-amber-700 dark:text-amber-400">{{ m(r.tax) }}</dd>
          <dt class="border-t border-[var(--k-border)] pt-2">{{ t('fin.wht.net') }}</dt>
          <dd class="border-t border-[var(--k-border)] pt-2 text-right text-2xl font-bold text-primary-600 dark:text-primary-400">{{ m(r.net) }}</dd>
        </dl>
        <p class="mt-3 text-sm text-[var(--k-muted)]">{{ t('fin.wht.explain') }}</p>
      </div>
      <Message severity="secondary" :closable="false" class="text-sm">{{ t('fin.wht.note') }}</Message>
      <RatesNote />
    </section>
  </div>
</template>
