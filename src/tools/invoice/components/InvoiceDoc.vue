<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { inRiel, lineAmount, type Doc, type Line, type Payment } from '../db/data'
import { formatMoney } from '@/core/util/money'

/**
 * A4 quote / invoice / receipt. Labels are printed in Khmer and English (usual for Cambodian
 * business papers). Khmer text uses Khmer OS Siemreap (body) and Khmer OS Muol Light (titles).
 * A dollar invoice also shows riel at the document's rate, as GDT asks of tax invoices.
 */
const props = defineProps<{
  kind: 'QUOTE' | 'INVOICE' | 'RECEIPT'
  doc: Doc
  lines: Line[]
  payments: Payment[]
  biz: Record<string, string>
  logo?: string | null
  khqr?: string | null
}>()
const { t } = useI18n()
const bi = (k: string, named: Record<string, unknown> = {}) => ({ km: t(k, named, { locale: 'km' }), en: t(k, named, { locale: 'en' }) })
const cur = computed(() => props.doc.currency)
const m = (v: number) => formatMoney(v, cur.value)
const paid = computed(() => props.payments.reduce((s, p) => s + p.amount, 0))
const isTax = computed(() => props.kind === 'INVOICE' && props.doc.vat_rate > 0 && !!props.biz.vat_tin)
const title = computed(() => bi(props.kind === 'QUOTE' ? 'iv.doc.quote' : props.kind === 'RECEIPT' ? 'iv.doc.receipt' : isTax.value ? 'iv.doc.taxInvoice' : 'iv.doc.invoice'))
const mark = computed(() => (props.doc.status === 'VOID' ? 'VOID' : props.kind !== 'QUOTE' && props.doc.status === 'DRAFT' ? 'DRAFT' : ''))
const riel = (v: number) => formatMoney(inRiel(v, cur.value, props.doc.khr_per_usd), 'KHR')
const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toLocaleString('en-US', { maximumFractionDigits: 3 }))
const methodLabel = (k: string | null) => (k ? t(`iv.method.${k}`, k) : '')
</script>

<template>
  <div class="inv-doc">
    <div v-if="mark" class="inv-mark">{{ mark }}</div>
    <header class="inv-head">
      <img v-if="logo" :src="logo" alt="" class="inv-logo" />
      <div class="inv-biz">
        <div class="inv-bizname">{{ biz.book_name }}</div>
        <div v-if="biz.name_en" class="inv-biznameen">{{ biz.name_en }}</div>
        <div v-if="biz.vat_tin" class="inv-small">{{ bi('iv.vatTin').km }} / VATTIN: <b>{{ biz.vat_tin }}</b></div>
        <div v-if="biz.address" class="inv-small inv-pre">{{ biz.address }}</div>
        <div class="inv-small">{{ [biz.phone, biz.email].filter(Boolean).join(' · ') }}</div>
      </div>
    </header>

    <h1 class="inv-title">{{ title.km }}<span>{{ title.en.toUpperCase() }}</span></h1>

    <section class="inv-parties">
      <div class="inv-box">
        <div class="inv-label">{{ bi('iv.doc.billTo').km }} / {{ bi('iv.doc.billTo').en }}</div>
        <div v-if="doc.client_company" class="inv-strong">{{ doc.client_company }}</div>
        <div :class="{ 'inv-strong': !doc.client_company }">{{ doc.client_name }}</div>
        <div v-if="doc.client_vat_tin" class="inv-small">VATTIN: {{ doc.client_vat_tin }}</div>
        <div v-if="doc.client_address" class="inv-small inv-pre">{{ doc.client_address }}</div>
        <div class="inv-small">{{ [doc.client_phone, doc.client_email].filter(Boolean).join(' · ') }}</div>
      </div>
      <table class="inv-meta">
        <tr><td>{{ bi('iv.doc.number').km }} / {{ bi('iv.doc.number').en }}</td><td>{{ doc.number ?? '—' }}</td></tr>
        <tr><td>{{ bi('iv.doc.date').km }} / {{ bi('iv.doc.date').en }}</td><td>{{ kind === 'RECEIPT' && payments.length ? payments[payments.length - 1].date : doc.date }}</td></tr>
        <tr v-if="doc.due_date && kind !== 'RECEIPT'">
          <td>{{ kind === 'QUOTE' ? `${bi('iv.doc.validUntil').km} / ${bi('iv.doc.validUntil').en}` : `${bi('iv.doc.due').km} / ${bi('iv.doc.due').en}` }}</td>
          <td>{{ doc.due_date }}</td>
        </tr>
        <tr v-if="cur === 'USD'"><td>{{ bi('iv.doc.rate').km }} / {{ bi('iv.doc.rate').en }}</td><td>{{ doc.khr_per_usd.toLocaleString('en-US') }} ៛</td></tr>
      </table>
    </section>

    <table class="inv-lines">
      <thead>
        <tr>
          <th class="inv-no">{{ bi('iv.doc.no').km }}<br />{{ bi('iv.doc.no').en }}</th>
          <th>{{ bi('iv.description').km }}<br />{{ bi('iv.description').en }}</th>
          <th class="inv-num">{{ bi('iv.qty').km }}<br />{{ bi('iv.qty').en }}</th>
          <th class="inv-num">{{ bi('iv.unitPrice').km }}<br />{{ bi('iv.unitPrice').en }}</th>
          <th class="inv-num">{{ bi('iv.amount').km }}<br />{{ bi('iv.amount').en }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(l, i) in lines" :key="l.id">
          <td class="inv-no">{{ i + 1 }}</td>
          <td>{{ l.name }}<div v-if="l.detail" class="inv-small inv-pre">{{ l.detail }}</div></td>
          <td class="inv-num">{{ qty(l.qty) }}{{ l.unit ? ` ${l.unit}` : '' }}</td>
          <td class="inv-num">{{ m(l.price) }}</td>
          <td class="inv-num">{{ m(lineAmount(l, cur)) }}</td>
        </tr>
      </tbody>
    </table>

    <section class="inv-bottom">
      <div class="inv-notes">
        <p v-if="doc.note" class="inv-pre">{{ doc.note }}</p>
        <div v-if="doc.terms" class="inv-small">
          <div class="inv-label">{{ bi('iv.terms').km }} / {{ bi('iv.terms').en }}</div>
          <div class="inv-pre">{{ doc.terms }}</div>
        </div>
        <div v-if="kind !== 'RECEIPT' && (biz.pay_info || khqr)" class="inv-pay">
          <img v-if="khqr" :src="khqr" alt="KHQR" class="inv-khqr" />
          <div v-if="biz.pay_info" class="inv-small">
            <div class="inv-label">{{ bi('iv.payInfo').km }} / {{ bi('iv.payInfo').en }}</div>
            <div class="inv-pre">{{ biz.pay_info }}</div>
          </div>
        </div>
      </div>
      <table class="inv-totals">
        <tr><td>{{ bi('iv.subtotal').km }} / {{ bi('iv.subtotal').en }}</td><td>{{ m(doc.subtotal) }}</td></tr>
        <tr v-if="doc.discount"><td>{{ bi('iv.discount').km }} / {{ bi('iv.discount').en }}</td><td>−{{ m(Math.min(doc.discount, doc.subtotal)) }}</td></tr>
        <tr v-if="doc.vat_rate"><td>{{ bi('iv.vatLine', { rate: doc.vat_rate }).km }} / {{ bi('iv.vatLine', { rate: doc.vat_rate }).en }}</td><td>{{ m(doc.vat) }}</td></tr>
        <tr class="inv-grand"><td>{{ bi('iv.total').km }} / {{ bi('iv.total').en }}</td><td>{{ m(doc.total) }}</td></tr>
        <template v-if="cur === 'USD'">
          <tr class="inv-small"><td>{{ bi('iv.doc.totalRiel').km }} / {{ bi('iv.doc.totalRiel').en }}</td><td>{{ riel(doc.total) }}</td></tr>
          <tr v-if="doc.vat_rate" class="inv-small"><td>{{ bi('iv.doc.vatRiel').km }} / {{ bi('iv.doc.vatRiel').en }}</td><td>{{ riel(doc.vat) }}</td></tr>
        </template>
        <template v-if="kind !== 'QUOTE' && paid > 0">
          <tr v-for="p in payments" :key="p.id" class="inv-small">
            <td>{{ bi('iv.paidOn').km }} {{ p.date }}{{ p.method ? ` · ${methodLabel(p.method)}` : '' }}</td>
            <td>{{ m(p.amount) }}</td>
          </tr>
          <tr class="inv-grand"><td>{{ bi('iv.balance').km }} / {{ bi('iv.balance').en }}</td><td>{{ m(Math.max(0, doc.total - paid)) }}</td></tr>
        </template>
      </table>
    </section>

    <footer class="inv-sign">
      <div>{{ bi('iv.doc.customerSign').km }}<br />{{ bi('iv.doc.customerSign').en }}</div>
      <div>{{ bi('iv.doc.sellerSign').km }}<br />{{ bi('iv.doc.sellerSign').en }}</div>
    </footer>
  </div>
</template>

<style>
.inv-doc {
  position: relative;
  font-family: 'Khmer OS Siemreap', 'Kantumruy Pro Variable', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.45;
  color: #000;
  padding: 8mm 10mm;
}
.inv-doc .inv-mark {
  position: absolute;
  top: 70mm;
  left: 0;
  right: 0;
  text-align: center;
  font: 700 72pt Arial, sans-serif;
  color: rgba(0, 0, 0, 0.08);
  transform: rotate(-20deg);
  pointer-events: none;
}
.inv-doc .inv-head {
  display: flex;
  gap: 5mm;
  align-items: flex-start;
  border-bottom: 1.5px solid #000;
  padding-bottom: 3mm;
}
.inv-doc .inv-logo {
  width: 24mm;
  height: 24mm;
  object-fit: contain;
}
.inv-doc .inv-bizname {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', Arial, sans-serif;
  font-size: 14pt;
}
.inv-doc .inv-biznameen {
  font-weight: 700;
  font-size: 11pt;
}
.inv-doc .inv-title {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', Arial, sans-serif;
  text-align: center;
  font-size: 15pt;
  margin: 4mm 0;
  font-weight: 400;
}
.inv-doc .inv-title span {
  display: block;
  font: 700 12pt Arial, sans-serif;
  letter-spacing: 0.08em;
}
.inv-doc .inv-small {
  font-size: 8.5pt;
}
.inv-doc .inv-pre {
  white-space: pre-line;
}
.inv-doc .inv-strong {
  font-weight: 700;
}
.inv-doc .inv-label {
  font-size: 8.5pt;
  font-weight: 700;
}
.inv-doc .inv-parties {
  display: flex;
  justify-content: space-between;
  gap: 6mm;
  margin-bottom: 4mm;
}
.inv-doc .inv-box {
  flex: 1;
  border: 1px solid #000;
  padding: 2mm 3mm;
}
.inv-doc .inv-meta td {
  padding: 0.5mm 0 0.5mm 3mm;
  font-size: 9pt;
  vertical-align: top;
}
.inv-doc .inv-meta td:last-child {
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
.inv-doc table {
  border-collapse: collapse;
}
.inv-doc .inv-lines {
  width: 100%;
}
.inv-doc .inv-lines th {
  border: 1px solid #000;
  background: #eee;
  font-size: 8.5pt;
  padding: 1mm 2mm;
  text-align: left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.inv-doc .inv-lines td {
  border: 1px solid #000;
  padding: 1.2mm 2mm;
  vertical-align: top;
}
.inv-doc .inv-no {
  width: 9mm;
  text-align: center !important;
}
.inv-doc .inv-num {
  text-align: right !important;
  white-space: nowrap;
}
.inv-doc .inv-bottom {
  display: flex;
  gap: 6mm;
  margin-top: 3mm;
  break-inside: avoid;
}
.inv-doc .inv-notes {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2mm;
}
.inv-doc .inv-pay {
  display: flex;
  gap: 3mm;
  align-items: flex-start;
}
.inv-doc .inv-khqr {
  width: 32mm;
  height: auto;
}
.inv-doc .inv-totals {
  min-width: 78mm;
}
.inv-doc .inv-totals td {
  padding: 0.8mm 0 0.8mm 2mm;
  border-bottom: 1px dotted #999;
}
.inv-doc .inv-totals td:last-child {
  text-align: right;
  white-space: nowrap;
}
.inv-doc .inv-grand td {
  font-weight: 700;
  font-size: 11pt;
  border-top: 1.5px solid #000;
  border-bottom: 1.5px solid #000;
}
.inv-doc .inv-sign {
  display: flex;
  justify-content: space-between;
  margin-top: 14mm;
  text-align: center;
  font-size: 9pt;
  break-inside: avoid;
}
.inv-doc .inv-sign div {
  width: 60mm;
  margin-top: 18mm;
  padding-top: 1mm;
  border-top: 1px dotted #000;
}
</style>
