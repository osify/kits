<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import CartLines from './CartLines.vue'
import MoneyInput from './MoneyInput.vue'
import CustomerPicker from './CustomerPicker.vue'
import { useShopStore } from '../stores/shop'
import { hasFeature } from '@/core/license'
import type { SaleLine, SaleWithLines } from '../db/sales'

/** The current POS sale: lines, customer, discount, note, total and actions. */
const props = defineProps<{ sale: SaleWithLines | null; parkedCount: number }>()
const emit = defineEmits<{
  qty: [line: SaleLine, qty: number]
  edit: [line: SaleLine]
  discount: [v: number]
  note: [v: string]
  customer: [id: string | null]
  clear: []
  park: []
  parked: []
  charge: []
}>()
const { t } = useI18n()
const shop = useShopStore()
const discount = ref<number | null>(0)
const note = ref('')
const customer = ref<string | null>(null)

watch(
  () => props.sale,
  (s) => {
    discount.value = s?.discount ?? 0
    note.value = s?.note ?? ''
    customer.value = s?.customer_id ?? null
  },
  { immediate: true },
)
watch(customer, (v) => {
  if (v !== (props.sale?.customer_id ?? null)) emit('customer', v)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-1 border-b border-[var(--k-border)] px-3 py-2">
      <h2 class="flex-1 font-semibold">{{ t('pos.sell.cart') }}</h2>
      <Button
        v-if="hasFeature('parked')"
        :label="parkedCount ? String(parkedCount) : undefined"
        icon="pi pi-inbox"
        text
        size="small"
        :aria-label="t('pos.park.list')"
        v-tooltip.bottom="t('pos.park.list')"
        @click="emit('parked')"
      />
      <Button
        v-if="hasFeature('parked') && sale?.lines.length"
        icon="pi pi-pause"
        text
        size="small"
        :aria-label="t('pos.park.park')"
        v-tooltip.bottom="t('pos.park.park')"
        @click="emit('park')"
      />
      <Button v-if="sale?.lines.length" icon="pi pi-trash" text size="small" severity="danger" :aria-label="t('pos.sell.clear')" @click="emit('clear')" />
    </div>
    <div v-if="hasFeature('customers')" class="border-b border-[var(--k-border)] px-3 py-2">
      <CustomerPicker v-model="customer" :name="sale?.customer_name" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-3">
      <p v-if="!sale?.lines.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('pos.sell.emptyCart') }}</p>
      <CartLines v-else :lines="sale.lines" @qty="(l, q) => emit('qty', l, q)" @edit="(l) => emit('edit', l)" />
    </div>
    <div class="flex flex-col gap-2 border-t border-[var(--k-border)] p-3">
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.discount') }}<MoneyInput v-model="discount" @blur="emit('discount', discount ?? 0)" @keydown.enter="emit('discount', discount ?? 0)" /></label>
        <label class="text-xs text-[var(--k-muted)]">{{ t('pos.c.note') }}<InputText v-model="note" class="w-full" @blur="emit('note', note)" /></label>
      </div>
      <div v-if="sale?.discount" class="flex justify-between text-sm"><span>{{ t('pos.c.subtotal') }}</span><span>{{ shop.fmt(sale.subtotal) }}</span></div>
      <div class="flex items-baseline justify-between">
        <span class="font-semibold">{{ t('pos.c.total') }}</span>
        <span class="text-right">
          <span class="text-2xl font-bold">{{ shop.fmt(sale?.total ?? 0) }}</span>
          <span v-if="shop.dual" class="block text-sm text-[var(--k-muted)]">{{ shop.fmtAlt(sale?.total ?? 0) }}</span>
        </span>
      </div>
      <Button :label="t('pos.sell.charge')" icon="pi pi-wallet" size="large" :disabled="!sale?.lines.length" @click="emit('charge')" />
    </div>
  </div>
</template>
