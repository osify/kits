<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { netIn, returnSummary, type Line, type Run } from '../db/data'
import { formatMoney } from '@/core/util/money'
import { nssfRule } from '@/tools/finance/tax'

/**
 * Printed papers. Khmer text uses Khmer OS Siemreap (body) and Khmer OS Muol Light (titles).
 * - 'payslips' one A5 payslip per staff member, each on its own page
 * - 'return'   A4 monthly summary for the Tax on Salary return and NSSF, with the staff list
 */
const props = defineProps<{ kind: 'payslips' | 'return'; run: Run; lines: Line[]; biz: Record<string, string> }>()
const { t } = useI18n()
const m = (v: number) => formatMoney(v, 'KHR')
const s = computed(() => returnSummary(props.lines, props.run.month))
const rule = computed(() => nssfRule(props.run.month))
const amt = (l: Line, v: number) => formatMoney(v, l.currency)
</script>

<template>
  <div class="pr-doc">
    <template v-if="kind === 'payslips'">
      <section v-for="l in lines" :key="l.id" class="pr-slip">
        <header class="pr-head">
          <div>
            <div class="pr-biz">{{ biz.book_name }}</div>
            <div class="pr-small">{{ [biz.address, biz.phone].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="pr-right pr-small">{{ t('pr.month') }}<br /><b>{{ run.month }}</b></div>
        </header>
        <h1 class="pr-title">{{ t('pr.doc.payslip') }}</h1>
        <p><b>{{ l.code }} · {{ l.name }}</b><template v-if="l.position"> · {{ l.position }}</template></p>
        <table class="pr-table">
          <tr><td>{{ t('fin.tax.salary') }}</td><td class="pr-right">{{ amt(l, l.salary) }}</td></tr>
          <tr v-if="l.bonus"><td>{{ t('fin.tax.bonus') }}</td><td class="pr-right">{{ amt(l, l.bonus) }}</td></tr>
          <tr v-if="l.seniority"><td>{{ t('fin.tax.seniority') }}</td><td class="pr-right">{{ amt(l, l.seniority) }}</td></tr>
          <tr v-if="l.currency === 'USD'" class="pr-muted"><td>{{ t('pr.inRielAt', { rate: run.khr_per_usd.toLocaleString('en-US') }) }}</td><td class="pr-right">{{ m(l.gross_khr) }}</td></tr>
          <tr class="pr-muted"><td>{{ t('fin.tax.taxBase') }}</td><td class="pr-right">{{ m(l.base_khr) }}</td></tr>
          <tr><td>{{ t('fin.tax.salaryTax') }}</td><td class="pr-right">−{{ m(l.tax_khr) }}</td></tr>
          <tr v-if="l.pension_khr"><td>{{ t('pr.pensionEmployee') }}</td><td class="pr-right">−{{ m(l.pension_khr) }}</td></tr>
          <tr v-if="l.deduction"><td>{{ t('pr.deduction') }}<template v-if="l.note"> ({{ l.note }})</template></td><td class="pr-right">−{{ amt(l, l.deduction) }}</td></tr>
          <tr class="pr-total"><td>{{ t('fin.tax.net') }}</td><td class="pr-right">{{ amt(l, netIn(l, run.khr_per_usd)) }}</td></tr>
        </table>
        <footer class="pr-sign">
          <div>{{ t('pr.doc.employer') }}</div>
          <div>{{ t('pr.doc.employee') }}</div>
        </footer>
      </section>
    </template>

    <template v-else>
      <header class="pr-head">
        <div>
          <div class="pr-biz">{{ biz.book_name }}</div>
          <div class="pr-small">
            <template v-if="biz.tin">TIN: {{ biz.tin }}</template><template v-if="biz.nssf_no"> · NSSF: {{ biz.nssf_no }}</template>
          </div>
          <div class="pr-small">{{ [biz.address, biz.phone].filter(Boolean).join(' · ') }}</div>
        </div>
        <div class="pr-right pr-small">{{ t('pr.month') }}<br /><b>{{ run.month }}</b><br />{{ t('pr.rateShort') }} {{ run.khr_per_usd.toLocaleString('en-US') }} ៛</div>
      </header>
      <h1 class="pr-title">{{ t('pr.doc.return') }}</h1>
      <table class="pr-table pr-grid">
        <tr><th></th><th class="pr-right">{{ t('pr.residents') }}</th><th class="pr-right">{{ t('pr.nonResidents') }}</th></tr>
        <tr><td>{{ t('pr.staffCount') }}</td><td class="pr-right">{{ s.residents.count }}</td><td class="pr-right">{{ s.nonResidents.count }}</td></tr>
        <tr><td>{{ t('pr.grossPaid') }}</td><td class="pr-right">{{ m(s.residents.gross) }}</td><td class="pr-right">{{ m(s.nonResidents.gross) }}</td></tr>
        <tr><td>{{ t('pr.exempt') }}</td><td class="pr-right">{{ m(s.residents.exempt) }}</td><td class="pr-right">{{ m(s.nonResidents.exempt) }}</td></tr>
        <tr><td>{{ t('pr.pensionEmployee') }}</td><td class="pr-right">{{ m(s.residents.pension) }}</td><td class="pr-right">{{ m(s.nonResidents.pension) }}</td></tr>
        <tr><td>{{ t('fin.tax.allowances') }}</td><td class="pr-right">{{ m(s.residents.allowances) }}</td><td class="pr-right">—</td></tr>
        <tr><td>{{ t('fin.tax.taxBase') }}</td><td class="pr-right">{{ m(s.residents.base) }}</td><td class="pr-right">{{ m(s.nonResidents.base) }}</td></tr>
        <tr class="pr-total"><td>{{ t('fin.tax.salaryTax') }}</td><td class="pr-right">{{ m(s.residents.tax) }}</td><td class="pr-right">{{ m(s.nonResidents.tax) }}</td></tr>
      </table>
      <table class="pr-table">
        <tr><td>{{ t('pr.fringeValue', { n: s.fringe.count }) }}</td><td class="pr-right">{{ m(s.fringe.value) }}</td></tr>
        <tr><td>{{ t('fin.tax.fbt') }}</td><td class="pr-right">{{ m(s.fringe.fbt) }}</td></tr>
        <tr class="pr-total"><td>{{ t('pr.taxTotal') }}</td><td class="pr-right">{{ m(s.taxTotal) }}</td></tr>
        <tr><td colspan="2" class="pr-small">{{ t('pr.dueOn', { date: s.dueDate, edate: s.eDueDate }) }}</td></tr>
      </table>
      <table class="pr-table">
        <tr><td>{{ t('pr.nssfFor', { n: s.nssf.count }) }}</td><td></td></tr>
        <tr><td class="pr-indent">{{ t('fin.tax.occupational', { pct: `${rule.occupationalRisk}%` }) }}</td><td class="pr-right">{{ m(s.nssf.risk) }}</td></tr>
        <tr><td class="pr-indent">{{ t('fin.tax.health', { pct: `${rule.healthCare}%` }) }}</td><td class="pr-right">{{ m(s.nssf.health) }}</td></tr>
        <tr><td class="pr-indent">{{ t('pr.pensionEmployer') }}</td><td class="pr-right">{{ m(s.nssf.pensionEmployer) }}</td></tr>
        <tr><td class="pr-indent">{{ t('pr.pensionEmployee') }}</td><td class="pr-right">{{ m(s.nssf.pensionEmployee) }}</td></tr>
        <tr class="pr-total"><td>{{ t('pr.nssfTotal') }}</td><td class="pr-right">{{ m(s.nssf.total) }}</td></tr>
      </table>
      <h2 class="pr-h2">{{ t('pr.staffList') }}</h2>
      <table class="pr-table pr-grid pr-list">
        <tr>
          <th>{{ t('pr.code') }}</th><th>{{ t('pr.name') }}</th><th class="pr-right">{{ t('pr.grossPaid') }}</th><th class="pr-right">{{ t('fin.tax.taxBase') }}</th>
          <th class="pr-right">{{ t('pr.taxShort') }}</th><th class="pr-right">{{ t('pr.fbtShort') }}</th><th class="pr-right">{{ t('fin.tax.net') }}</th>
        </tr>
        <tr v-for="l in lines" :key="l.id">
          <td>{{ l.code }}</td><td>{{ l.name }}<span v-if="!l.resident"> *</span></td><td class="pr-right">{{ m(l.gross_khr) }}</td><td class="pr-right">{{ m(l.base_khr) }}</td>
          <td class="pr-right">{{ m(l.tax_khr) }}</td><td class="pr-right">{{ l.fbt_khr ? m(l.fbt_khr) : '' }}</td><td class="pr-right">{{ m(l.net_khr) }}</td>
        </tr>
      </table>
      <p v-if="s.nonResidents.count" class="pr-small">* {{ t('pr.nonResidentMark') }}</p>
      <footer class="pr-sign"><div>{{ t('pr.doc.preparedBy') }}</div><div>{{ t('pr.doc.approvedBy') }}</div></footer>
    </template>
  </div>
</template>

<style>
.pr-doc {
  font-family: 'Khmer OS Siemreap', 'Kantumruy Pro Variable', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.45;
  color: #000;
  padding: 6mm 8mm;
}
.pr-doc .pr-slip {
  break-after: page;
  page-break-after: always;
}
.pr-doc .pr-slip:last-child {
  break-after: auto;
  page-break-after: auto;
}
.pr-doc .pr-head {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  border-bottom: 1.5px solid #000;
  padding-bottom: 2mm;
}
.pr-doc .pr-biz,
.pr-doc .pr-title {
  font-family: 'Khmer OS Muol Light', 'Kantumruy Pro Variable', Arial, sans-serif;
}
.pr-doc .pr-biz {
  font-size: 13pt;
}
.pr-doc .pr-title {
  text-align: center;
  font-size: 14pt;
  font-weight: 400;
  margin: 3mm 0;
}
.pr-doc .pr-h2 {
  font-weight: 700;
  margin: 4mm 0 1mm;
}
.pr-doc .pr-small {
  font-size: 8.5pt;
}
.pr-doc .pr-right {
  text-align: right;
  white-space: nowrap;
}
.pr-doc .pr-table {
  width: 100%;
  border-collapse: collapse;
  margin: 2mm 0 3mm;
  break-inside: avoid;
}
.pr-doc .pr-table td,
.pr-doc .pr-table th {
  padding: 0.8mm 1.5mm;
  border-bottom: 1px dotted #999;
  text-align: left;
}
.pr-doc .pr-grid td,
.pr-doc .pr-grid th {
  border: 1px solid #000;
}
.pr-doc .pr-table .pr-right {
  text-align: right;
}
.pr-doc .pr-grid th {
  background: #eee;
  font-size: 8.5pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pr-doc .pr-list {
  font-size: 8.5pt;
}
.pr-doc .pr-muted td {
  color: #444;
  font-size: 9pt;
}
.pr-doc .pr-indent {
  padding-left: 5mm !important;
}
.pr-doc .pr-total td {
  font-weight: 700;
  border-top: 1.5px solid #000;
}
.pr-doc .pr-sign {
  display: flex;
  justify-content: space-between;
  text-align: center;
  font-size: 9pt;
  break-inside: avoid;
}
.pr-doc .pr-sign div {
  width: 55mm;
  margin-top: 16mm;
  padding-top: 1mm;
  border-top: 1px dotted #000;
}
</style>
