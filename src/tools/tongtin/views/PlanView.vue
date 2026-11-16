<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AmountField from '@/components/AmountField.vue'
import { persisted } from '../../finance/state'
import { simulate } from '../rules'
import { formatMoney } from '@/core/util/money'

/** Plan a circle before it starts: what each turn receives, pays and earns or costs. */
const { t } = useI18n()
const f = persisted('tt.plan', {
  hands: 10,
  amount: 100_000,
  currency: 'KHR' as 'KHR' | 'USD',
  mode: 'BID' as 'BID' | 'ORDER',
  headFirst: true,
  firstBid: 20_000,
  lastBid: 0,
  bids: [] as number[],
})
const n = computed(() => Math.max(2, Math.min(60, Math.floor(f.hands || 2))))
/** Spread bids from the first biddable round down to the last (early money costs more). */
function fill() {
  const start = f.headFirst ? 1 : 0
  const span = Math.max(1, n.value - 1 - start)
  const step = f.currency === 'KHR' ? 100 : 1
  f.bids = Array.from({ length: n.value }, (_, i) => (i < start ? 0 : Math.round((f.firstBid + ((f.lastBid - f.firstBid) * (i - start)) / span) / step) * step))
}
watch(() => [n.value, f.headFirst, f.firstBid, f.lastBid, f.currency], fill, { immediate: !f.bids.length })
const rows = computed(() => simulate(n.value, f.amount, f.mode === 'BID' ? f.bids : [], f.mode === 'BID' && f.headFirst, f.mode))
const m = (v: number) => formatMoney(v, f.currency)
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
const modeOpts = computed(() => (['BID', 'ORDER'] as const).map((x) => ({ label: t(`tt.mode.${x}`), value: x })))
const rate = (r: number | null) => (r === null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}%`)
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[20rem_1fr]">
    <section class="card flex flex-col gap-3 lg:self-start">
      <h1 class="text-lg font-semibold">{{ t('tt.planTitle') }}</h1>
      <p class="text-sm text-[var(--k-muted)]">{{ t('tt.planIntro') }}</p>
      <label class="field"><span>{{ t('tt.handsLabel') }}</span><InputNumber v-model="f.hands" :min="2" :max="60" show-buttons class="w-full" input-class="w-full" /></label>
      <div class="field">
        <span>{{ t('tt.amount') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.amount" :currency="f.currency" class="flex-1" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <SelectButton v-model="f.mode" :options="modeOpts" option-label="label" option-value="value" :allow-empty="false" />
      <template v-if="f.mode === 'BID'">
        <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.headFirst" /> {{ t('tt.headFirst') }}</label>
        <label class="field"><span>{{ t('tt.firstBid') }}</span><AmountField v-model="f.firstBid" :currency="f.currency" /></label>
        <label class="field"><span>{{ t('tt.lastBid') }}</span><AmountField v-model="f.lastBid" :currency="f.currency" /></label>
        <Button :label="t('tt.refill')" icon="pi pi-refresh" text size="small" class="self-start" @click="fill" />
      </template>
    </section>

    <section class="flex flex-col gap-3">
      <div class="card overflow-x-auto !p-0">
        <table class="w-full min-w-[34rem] text-sm whitespace-nowrap tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr>
              <th class="px-3 py-2 font-normal">{{ t('tt.turn') }}</th>
              <th v-if="f.mode === 'BID'" class="py-2 text-right font-normal">{{ t('tt.bid') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.receivedCol') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.paysTotal') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.gain') }}</th>
              <th class="px-3 py-2 text-right font-normal">{{ t('tt.ratePerRound') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.position" class="border-t border-[var(--k-border)]">
              <td class="px-3 py-1.5">{{ r.position }}<span v-if="r.position === 1 && f.mode === 'BID' && f.headFirst" class="ml-1 text-xs text-[var(--k-muted)]">({{ t('tt.head') }})</span></td>
              <td v-if="f.mode === 'BID'" class="py-1 text-right">
                <InputNumber
                  v-if="!(r.position === 1 && f.headFirst)"
                  v-model="f.bids[r.position - 1]"
                  :min="0"
                  :max="f.amount"
                  :step="f.currency === 'KHR' ? 1000 : 100"
                  size="small"
                  input-class="w-24 text-right"
                  :aria-label="`${t('tt.bid')} ${r.position}`"
                />
              </td>
              <td class="py-1.5 text-right font-semibold">{{ m(r.receives) }}</td>
              <td class="py-1.5 text-right">{{ m(r.pays) }}</td>
              <td class="py-1.5 text-right" :class="r.gain > 0 ? 'text-primary-700 dark:text-primary-400' : r.gain < 0 ? 'text-amber-700 dark:text-amber-400' : ''">{{ m(r.gain) }}</td>
              <td class="px-3 py-1.5 text-right">{{ rate(r.ratePerRound) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Message severity="secondary" :closable="false" class="text-sm">{{ t('tt.planNote') }}</Message>
    </section>
  </div>
</template>
