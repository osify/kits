<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import MoneyInput from './MoneyInput.vue'
import { useShopStore } from '../stores/shop'
import type { PayInput, PayMethod } from '../db/sales'
import { formatMoney, roundRiel, type Currency } from '@/core/util/money'
import { imageUrl } from '@/core/files/images'
import { hasFeature } from '@/core/license'

/** Take payment: cash (riel or dollars, change in the shop currency), KHQR, card or other. */
const props = defineProps<{ total: number; customerName?: string | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ pay: [p: PayInput] }>()

const { t } = useI18n()
const shop = useShopStore()

const method = ref<PayMethod>('CASH')
const cashCur = ref<Currency>('KHR')
const tendered = ref<number | null>(null)
const khqrUrl = ref<string | null>(null)

watch(visible, (v) => {
  if (!v) return
  method.value = 'CASH'
  cashCur.value = shop.base
  tendered.value = null
})
watchEffect(async () => {
  khqrUrl.value = await imageUrl('pos', shop.shop?.khqr_image)
})

const methods = computed(() => [
  { label: t('pos.sell.method.cash'), value: 'CASH', icon: 'pi pi-money-bill' },
  { label: 'KHQR', value: 'KHQR', icon: 'pi pi-qrcode' },
  { label: t('pos.sell.method.card'), value: 'CARD', icon: 'pi pi-credit-card' },
  { label: t('pos.sell.method.other'), value: 'OTHER', icon: 'pi pi-ellipsis-h' },
  ...(hasFeature('customers') ? [{ label: t('pos.sell.method.debt'), value: 'DEBT', icon: 'pi pi-book' }] : []),
])
const curOptions = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]

/** Total expressed in the currency the customer pays with. */
const totalIn = (c: Currency) => (c === shop.base ? props.total : shop.toAlt(props.total))
const receivedBase = computed(() => (tendered.value == null ? 0 : shop.toBase(tendered.value, cashCur.value)))
const change = computed(() => {
  const c = receivedBase.value - props.total
  return shop.base === 'KHR' ? roundRiel(Math.max(0, c), shop.step) : Math.max(0, c)
})
const short = computed(() => method.value === 'CASH' && tendered.value != null && tendered.value > 0 && receivedBase.value < props.total)
const needCustomer = computed(() => method.value === 'DEBT' && !props.customerName)

/** Quick cash buttons: exact amount and common notes above it. */
const quick = computed(() => {
  const c = cashCur.value
  const exact = totalIn(c)
  const notes = c === 'KHR' ? [1000, 2000, 5000, 10000, 20000, 50000, 100000] : [100, 500, 1000, 2000, 5000, 10000]
  const up = notes.filter((n) => n > exact).slice(0, 3)
  const round = c === 'KHR' ? Math.ceil(exact / 1000) * 1000 : Math.ceil(exact / 100) * 100
  return [...new Set([exact, round, ...up])].sort((a, b) => a - b).slice(0, 5)
})
const fmtIn = (v: number, c: Currency) => formatMoney(v, c)

function confirm() {
  if (method.value === 'CASH') {
    const tend = tendered.value && tendered.value > 0 ? tendered.value : totalIn(cashCur.value)
    emit('pay', { method: 'CASH', currency: cashCur.value, tendered: tend, change: tendered.value ? change.value : 0 })
  } else {
    emit('pay', { method: method.value, currency: shop.base, tendered: null, change: null })
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('pos.sell.payTitle')" class="w-[min(30rem,calc(100vw-1.5rem))]">
    <div class="flex flex-col gap-4">
      <div class="rounded-xl bg-primary-50 p-4 text-center dark:bg-primary-950">
        <div class="text-sm text-[var(--k-muted)]">{{ t('pos.c.total') }}</div>
        <div class="text-3xl font-bold">{{ shop.fmt(total) }}</div>
        <div v-if="shop.dual" class="text-[var(--k-muted)]">{{ shop.fmtAlt(total) }}</div>
      </div>

      <SelectButton v-model="method" :options="methods" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap">
        <template #option="{ option }">
          <i :class="option.icon" /><span>{{ option.label }}</span>
        </template>
      </SelectButton>

      <template v-if="method === 'CASH'">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">{{ t('pos.sell.received') }}</span>
          <span class="flex-1" />
          <SelectButton v-model="cashCur" :options="curOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
        </div>
        <MoneyInput v-model="tendered" :currency="cashCur" :placeholder="fmtIn(totalIn(cashCur), cashCur)" />
        <div class="flex flex-wrap gap-2">
          <Button v-for="q in quick" :key="q" size="small" severity="secondary" outlined :label="fmtIn(q, cashCur)" @click="tendered = q" />
        </div>
        <div v-if="tendered" class="flex items-center justify-between rounded-lg border border-[var(--k-border)] p-3">
          <span>{{ t('pos.sell.change') }}</span>
          <span class="text-right">
            <span class="text-xl font-bold">{{ shop.fmt(change) }}</span>
            <span v-if="shop.dual && change" class="block text-sm text-[var(--k-muted)]">{{ shop.fmtAlt(change) }}</span>
          </span>
        </div>
        <p v-if="short" class="text-sm text-red-600">{{ t('pos.sell.notEnough') }}</p>
      </template>

      <template v-else-if="method === 'DEBT'">
        <p v-if="customerName" class="text-center">{{ t('pos.sell.debtTo', { name: customerName }) }}</p>
        <p v-else class="text-center text-sm text-red-600">{{ t('pos.sell.debtNeedCustomer') }}</p>
      </template>

      <template v-else-if="method === 'KHQR'">
        <img v-if="khqrUrl" :src="khqrUrl" alt="KHQR" class="mx-auto max-h-72 rounded-lg bg-white p-2" />
        <p class="text-center text-sm text-[var(--k-muted)]">{{ khqrUrl ? t('pos.sell.khqrHint') : t('pos.sell.khqrMissing') }}</p>
      </template>
    </div>
    <template #footer>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.sell.confirmPay')" icon="pi pi-check" :disabled="short || needCustomer" @click="confirm" />
    </template>
  </Dialog>
</template>
