<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShopStore } from '../stores/shop'
import { parseMods, type SaleWithLines } from '../db/sales'
import { formatMoney } from '@/core/util/money'
import { imageUrl } from '@/core/files/images'

/** Customer receipt for 58/80 mm paper. Khmer text uses Khmer OS Siemreap when installed. */
const props = defineProps<{ sale: SaleWithLines }>()
const { t } = useI18n()
const shop = useShopStore()
const logo = ref<string | null>(null)

watchEffect(async () => {
  logo.value = await imageUrl('pos', shop.shop?.logo_image)
})

const cur = computed(() => props.sale.currency)
const m = (v: number) => formatMoney(v, cur.value)
const alt = (v: number) => {
  if (!shop.dual) return ''
  const a = cur.value === 'KHR' ? Math.round((v / props.sale.khr_per_usd) * 100) : Math.round((v / 100) * props.sale.khr_per_usd / 100) * 100
  return formatMoney(a, cur.value === 'KHR' ? 'USD' : 'KHR')
}
const pay = computed(() => props.sale.payments[0])
const when = computed(() => new Date(props.sale.updated_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }))
const methodLabel = (k: string) => t(`pos.sell.method.${k.toLowerCase()}`)
</script>

<template>
  <div class="receipt">
    <div class="center">
      <img v-if="logo" :src="logo" alt="" class="logo" />
      <div class="shop">{{ shop.shop?.name }}</div>
      <div v-if="shop.shop?.address" class="small">{{ shop.shop.address }}</div>
      <div v-if="shop.shop?.phone" class="small">{{ shop.shop.phone }}</div>
      <div v-if="shop.shop?.receipt_header" class="small pre">{{ shop.shop.receipt_header }}</div>
    </div>
    <div class="rule" />
    <div class="row small">
      <span>#{{ sale.number }}</span>
      <span>{{ when }}</span>
    </div>
    <div v-if="sale.customer_name" class="small">{{ t('pos.cust.customer') }}: {{ sale.customer_name }}</div>
    <div v-if="sale.status === 'VOID'" class="center void">*** VOID ***</div>
    <div class="rule" />
    <div v-for="l in sale.lines" :key="l.id" class="line">
      <div class="row">
        <span class="name">{{ l.name }}</span>
        <span>{{ l.internal ? t('pos.quick.free') : m(l.line_total) }}</span>
      </div>
      <div class="small muted">
        {{ l.qty }} × {{ m(l.unit_price) }}
        <template v-for="md in parseMods(l.modifiers)" :key="md.option_id"> · {{ md.name_km || md.name }}</template>
      </div>
    </div>
    <div class="rule" />
    <div v-if="sale.discount" class="row">
      <span>{{ t('pos.c.subtotal') }}</span><span>{{ m(sale.subtotal) }}</span>
    </div>
    <div v-if="sale.discount" class="row">
      <span>{{ t('pos.c.discount') }}</span><span>-{{ m(sale.discount) }}</span>
    </div>
    <div class="row total">
      <span>{{ t('pos.c.total') }}</span><span>{{ m(sale.total) }}</span>
    </div>
    <div v-if="alt(sale.total)" class="row small">
      <span>≈</span><span>{{ alt(sale.total) }}</span>
    </div>
    <template v-if="pay">
      <div class="row small">
        <span>{{ methodLabel(pay.method) }}</span>
        <span v-if="pay.tendered">{{ formatMoney(pay.tendered, pay.currency) }}</span>
      </div>
      <div v-if="pay.change_due" class="row small">
        <span>{{ t('pos.sell.change') }}</span><span>{{ m(pay.change_due) }}</span>
      </div>
    </template>
    <div class="rule" />
    <div class="center small pre">{{ shop.shop?.receipt_footer || t('pos.sell.thanks') }}</div>
    <div class="center tiny">kitroid.com</div>
  </div>
</template>

<style scoped>
.receipt {
  font-family: 'Khmer OS Siemreap', 'Kantumruy Pro Variable', sans-serif;
  font-size: 12px;
  line-height: 1.5;
  color: #000;
  padding: 2mm;
}
.center {
  text-align: center;
}
.shop {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', sans-serif;
  font-size: 15px;
  font-weight: 700;
}
.logo {
  max-width: 40%;
  max-height: 18mm;
  margin: 0 auto 1mm;
  display: block;
}
.small {
  font-size: 11px;
}
.tiny {
  font-size: 9px;
  margin-top: 1mm;
}
.muted {
  color: #333;
}
.pre {
  white-space: pre-line;
}
.rule {
  border-top: 1px dashed #000;
  margin: 1.5mm 0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
}
.name {
  flex: 1;
}
.total {
  font-size: 15px;
  font-weight: 700;
}
.void {
  font-weight: 700;
  font-size: 14px;
}
.line + .line {
  margin-top: 1mm;
}
</style>
