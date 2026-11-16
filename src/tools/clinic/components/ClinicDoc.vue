<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import QrCode from '@/components/QrCode.vue'
import type { Patient, RxItemRow, Visit, VisitLine } from '../db/data'
import { formatMoney } from '@/core/util/money'

/**
 * Printed papers (A5). Khmer text uses Khmer OS Siemreap (body) and Khmer OS Muol Light (title).
 * - 'rx'      prescription for the pharmacy: patient code, medicines, Kitroid code QR.
 *             No complaint, examination, diagnosis or vitals (the pharmacy does not need them).
 * - 'summary' visit summary for the patient: includes diagnosis, advice and follow-up.
 * - 'receipt' fees and payment.
 */
const props = defineProps<{
  kind: 'rx' | 'summary' | 'receipt'
  clinic: Record<string, string>
  patient: Patient
  visit: Visit
  rx: RxItemRow[]
  lines: VisitLine[]
  total: number
  currency: 'KHR' | 'USD'
  code?: string // Kitroid code for the rx QR
  showName: boolean
}>()
const { t } = useI18n()
const m = (v: number) => formatMoney(v, props.currency)
const ageYears = computed(() => (props.patient.birth_date ? Math.floor((Date.parse(props.visit.date) - Date.parse(props.patient.birth_date)) / 31_557_600_000) : null))
const title = computed(() => ({ rx: t('cl.doc.rx'), summary: t('cl.doc.summary'), receipt: t('cl.doc.receipt') })[props.kind])
const how = (i: RxItemRow) => [i.dose, i.times ? t('cl.timesDay', { n: i.times }) : '', i.days ? t('cl.forDays', { n: i.days }) : '', i.note].filter(Boolean).join(' · ')
</script>

<template>
  <div class="clinic-doc">
    <header class="doc-head">
      <div>
        <div class="doc-clinic">{{ clinic.book_name }}</div>
        <div class="doc-small">{{ [clinic.doctor, clinic.license].filter(Boolean).join(' · ') }}</div>
        <div class="doc-small">{{ [clinic.address, clinic.phone].filter(Boolean).join(' · ') }}</div>
      </div>
      <div class="doc-right doc-small">{{ visit.date }}<br />#{{ visit.queue_no }}</div>
    </header>
    <h1 class="doc-title">{{ title }}</h1>
    <div class="doc-patient">
      <span><b>{{ t('cl.patientCode') }}:</b> {{ patient.code }}</span>
      <span v-if="showName || kind !== 'rx'"><b>{{ t('hl.name') }}:</b> {{ patient.name }}</span>
      <span v-if="ageYears !== null"><b>{{ t('cl.age') }}:</b> {{ ageYears }}</span>
      <span v-if="patient.sex"><b>{{ t('hl.sex') }}:</b> {{ t(`hl.sex${patient.sex}`) }}</span>
    </div>
    <p v-if="patient.allergies && kind !== 'receipt'" class="doc-alert">{{ t('hl.allergies') }}: {{ patient.allergies }}</p>

    <template v-if="kind === 'summary'">
      <p v-if="visit.complaint"><b>{{ t('cl.complaint') }}:</b> {{ visit.complaint }}</p>
      <p v-if="visit.bp_sys || visit.temp || visit.pulse || visit.weight">
        <b>{{ t('cl.vitals') }}:</b>
        {{ [visit.bp_sys ? `BP ${visit.bp_sys}/${visit.bp_dia}` : '', visit.pulse ? `${t('hl.kind.PULSE')} ${visit.pulse}` : '', visit.temp ? `${visit.temp}°C` : '', visit.weight ? `${visit.weight} kg` : '', visit.spo2 ? `SpO₂ ${visit.spo2}%` : ''].filter(Boolean).join(' · ') }}
      </p>
      <p v-if="visit.diagnosis"><b>{{ t('cl.diagnosis') }}:</b> {{ visit.diagnosis }}</p>
      <p v-if="visit.plan" class="doc-pre"><b>{{ t('cl.plan') }}:</b> {{ visit.plan }}</p>
    </template>

    <template v-if="kind !== 'receipt' && rx.length">
      <h2 class="doc-h2">{{ t('cl.prescription') }}</h2>
      <ol class="doc-rx">
        <li v-for="i in rx" :key="i.id">
          <b>{{ i.name }}</b><span v-if="i.qty"> — {{ i.qty }} {{ i.unit ?? '' }}</span>
          <div class="doc-small">{{ how(i) }}</div>
        </li>
      </ol>
    </template>

    <template v-if="kind === 'receipt'">
      <table class="doc-table">
        <tr v-for="l in lines" :key="l.id">
          <td>{{ l.name }}<span v-if="l.qty !== 1"> × {{ l.qty }}</span></td>
          <td class="doc-right">{{ m(Math.round(l.qty * l.price)) }}</td>
        </tr>
        <tr v-if="visit.discount"><td>{{ t('cl.discount') }}</td><td class="doc-right">−{{ m(visit.discount) }}</td></tr>
        <tr class="doc-total"><td>{{ t('cl.total') }}</td><td class="doc-right">{{ m(total) }}</td></tr>
        <tr><td>{{ t('cl.paidLabel') }}</td><td class="doc-right">{{ m(visit.paid) }}</td></tr>
        <tr v-if="total > visit.paid"><td>{{ t('cl.balance') }}</td><td class="doc-right">{{ m(total - visit.paid) }}</td></tr>
      </table>
    </template>

    <p v-if="kind === 'summary' && visit.followup_date" class="doc-follow">{{ t('cl.followupOn', { date: visit.followup_date }) }}</p>

    <div v-if="kind === 'rx' && code" class="doc-qr">
      <QrCode :text="code" :size="120" :label="t('kx.codeLabel')" />
      <div class="doc-small">{{ t('cl.doc.qrNote') }}</div>
    </div>
    <footer class="doc-sign">
      <span v-if="kind !== 'receipt'">{{ t('cl.doc.signature') }}<br /><br />{{ clinic.doctor }}</span>
    </footer>
  </div>
</template>

<style>
.clinic-doc {
  font-family: 'Khmer OS Siemreap', 'Kantumruy Pro Variable', Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #000;
  padding: 4mm;
}
.clinic-doc p {
  margin: 1.5mm 0;
}
.clinic-doc .doc-head {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  border-bottom: 1px solid #000;
  padding-bottom: 2mm;
}
.clinic-doc .doc-clinic {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', Arial, sans-serif;
  font-size: 13pt;
}
.clinic-doc .doc-title {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', Arial, sans-serif;
  text-align: center;
  font-size: 14pt;
  margin: 3mm 0;
}
.clinic-doc .doc-h2 {
  font-weight: 700;
  margin: 3mm 0 1mm;
}
.clinic-doc .doc-small {
  font-size: 9pt;
}
.clinic-doc .doc-right {
  text-align: right;
}
.clinic-doc .doc-patient {
  display: flex;
  flex-wrap: wrap;
  gap: 1mm 5mm;
}
.clinic-doc .doc-alert {
  border: 1px solid #000;
  padding: 1mm 2mm;
  font-weight: 700;
}
.clinic-doc .doc-rx {
  padding-left: 6mm;
}
.clinic-doc .doc-rx li {
  margin-bottom: 1.5mm;
}
.clinic-doc .doc-pre {
  white-space: pre-line;
}
.clinic-doc .doc-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 2mm;
}
.clinic-doc .doc-table td {
  padding: 0.8mm 0;
  border-bottom: 1px dotted #999;
}
.clinic-doc .doc-total td {
  font-weight: 700;
  border-top: 1px solid #000;
}
.clinic-doc .doc-follow {
  font-weight: 700;
  margin-top: 3mm;
}
.clinic-doc .doc-qr {
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-top: 4mm;
}
.clinic-doc .doc-sign {
  margin-top: 6mm;
  text-align: right;
}
</style>
