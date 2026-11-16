<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useShopStore } from '../stores/shop'
import type { Summary, TopItem } from '../db/reports'

/** End-of-day (Z) report for thermal or A4 paper. */
defineProps<{ title: string; from: string; to: string; sum: Summary; top: TopItem[]; closedAt?: number | null }>()
const { t } = useI18n()
const shop = useShopStore()
</script>

<template>
  <div class="z">
    <div class="c head">{{ shop.shop?.name }}</div>
    <div class="c b">{{ title }}</div>
    <div class="c">{{ from === to ? from : `${from} → ${to}` }}</div>
    <div v-if="closedAt" class="c s">{{ t('pos.sum.closedAt') }} {{ new Date(closedAt).toLocaleString('en-GB') }}</div>
    <div class="r" />
    <div class="row b"><span>{{ t('pos.sum.net') }}</span><span>{{ shop.fmt(sum.net) }}</span></div>
    <div v-if="shop.dual" class="row s"><span /><span>≈ {{ shop.fmtAlt(sum.net) }}</span></div>
    <div class="row"><span>{{ t('pos.sum.gross') }}</span><span>{{ shop.fmt(sum.gross) }}</span></div>
    <div class="row"><span>{{ t('pos.c.discount') }}</span><span>-{{ shop.fmt(sum.discount) }}</span></div>
    <div class="r" />
    <div class="row"><span>{{ t('pos.sell.method.cash') }}</span><span>{{ shop.fmt(sum.cash) }}</span></div>
    <div class="row"><span>KHQR</span><span>{{ shop.fmt(sum.khqr) }}</span></div>
    <div class="row"><span>{{ t('pos.sum.otherPay') }}</span><span>{{ shop.fmt(sum.other) }}</span></div>
    <div class="row"><span>{{ t('pos.sum.quick') }}</span><span>{{ shop.fmt(sum.quick) }}</span></div>
    <div v-if="sum.debt" class="row"><span>{{ t('pos.sum.debt') }}</span><span>{{ shop.fmt(sum.debt) }}</span></div>
    <div v-if="sum.collected" class="row"><span>{{ t('pos.sum.collected') }}</span><span>{{ shop.fmt(sum.collected) }}</span></div>
    <div class="row b"><span>{{ t('pos.sum.cashDrawer') }}</span><span>{{ shop.fmt(sum.cash + sum.collectedCash) }}</span></div>
    <div class="r" />
    <div class="row"><span>{{ t('pos.sum.tickets') }}</span><span>{{ sum.posCount }}</span></div>
    <div class="row"><span>{{ t('pos.sum.items') }}</span><span>{{ sum.items }}</span></div>
    <div v-if="sum.internalItems" class="row"><span>{{ t('pos.sum.free') }}</span><span>{{ sum.internalItems }}</span></div>
    <div class="r" />
    <div v-for="i in top" :key="i.name" class="row s">
      <span class="n">{{ i.name }} × {{ i.qty }}<template v-if="i.internal"> (+{{ i.internal }})</template></span>
      <span>{{ shop.fmt(i.amount) }}</span>
    </div>
    <div class="r" />
    <div class="c s">{{ new Date().toLocaleString('en-GB') }} · kitroid.com</div>
  </div>
</template>

<style scoped>
.z {
  font-family: 'Khmer OS Siemreap', 'Kantumruy Pro Variable', sans-serif;
  font-size: 12px;
  line-height: 1.5;
  color: #000;
  padding: 2mm;
}
.head {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', sans-serif;
  font-size: 15px;
}
.c {
  text-align: center;
}
.b {
  font-weight: 700;
}
.s {
  font-size: 11px;
}
.r {
  border-top: 1px dashed #000;
  margin: 1.5mm 0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
}
.n {
  flex: 1;
}
</style>
