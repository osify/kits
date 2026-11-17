<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import PrintSheet from '@/tools/pos/components/PrintSheet.vue'
import LineDialog from '../components/LineDialog.vue'
import PayrollDocs from '../components/PayrollDocs.vue'
import { db } from '../db'
import {
  addToRun, closeRun, deleteRun, getRun, listLines, listStaff, missingStaff, monthCsv, netIn, refreshFromStaff, reopenRun, returnSummary, setRunRate, startRun,
  type Line, type Run, type Staff,
} from '../db/data'
import { usePayroll } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** One month: everyone's pay and tax, the Tax on Salary / NSSF return totals, payslips. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const pr = usePayroll()
const month = computed(() => (route.params.month as string) || today().slice(0, 7))
const monthDate = computed({
  get: () => new Date(month.value + '-01T00:00:00'),
  set: (d: Date) => router.push(`/m/${today(d).slice(0, 7)}`),
})
const run = ref<Run | null>(null)
const lines = ref<Line[]>([])
const missing = ref<Staff[]>([])
const staffCount = ref(0)
const newRate = ref(pr.rate)
async function load() {
  run.value = (await getRun(db, month.value)) ?? null
  if (run.value) {
    ;[lines.value, missing.value] = await Promise.all([listLines(db, month.value), missingStaff(db, month.value)])
  } else staffCount.value = (await listStaff(db, month.value)).length
}
onMounted(load)
const locked = computed(() => run.value?.status === 'CLOSED')
const s = computed(() => returnSummary(lines.value, month.value))
const m = (v: number) => formatMoney(v, 'KHR')
const hasUsd = computed(() => lines.value.some((l) => l.currency === 'USD'))

async function start() {
  await startRun(db, month.value, newRate.value || pr.rate)
  await load()
}
async function changeRate(v: number) {
  if (!run.value || !v || v === run.value.khr_per_usd) return
  await setRunRate(db, month.value, v)
  await load()
}
async function addMissing() {
  for (const st of missing.value) await addToRun(db, month.value, st.id)
  await load()
}
async function refresh() {
  await refreshFromStaff(db, month.value)
  await load()
  toast.add({ severity: 'success', summary: t('pr.refreshed'), life: 2000 })
}
function close() {
  confirm.require({
    header: t('pr.closeMonth'),
    message: t('pr.closeConfirm', { month: month.value }),
    icon: 'pi pi-lock',
    acceptProps: { label: t('pr.closeMonth') },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await closeRun(db, month.value)
      await load()
    },
  })
}
async function reopen() {
  await reopenRun(db, month.value)
  await load()
}
function remove() {
  confirm.require({
    message: t('pr.deleteMonthConfirm', { month: month.value }),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteRun(db, month.value)
      await load()
    },
  })
}
const editing = ref<Line | null>(null)
const lineOpen = ref(false)
function edit(l: Line) {
  editing.value = l
  lineOpen.value = true
}
const printing = ref(false)
const printKind = ref<'payslips' | 'return'>('return')
function print(k: 'payslips' | 'return') {
  printKind.value = k
  printing.value = true
}
async function exportCsv() {
  const url = URL.createObjectURL(new Blob([await monthCsv(db, month.value)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-payroll-${month.value}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-xl font-semibold">{{ t('pr.payrollFor') }}</h1>
      <DatePicker v-model="monthDate" view="month" date-format="yy-mm" show-icon class="w-40" />
      <Tag v-if="run" :severity="locked ? 'secondary' : 'info'" :icon="locked ? 'pi pi-lock' : 'pi pi-pencil'" :value="locked ? t('pr.closed') : t('pr.open')" />
    </div>

    <!-- Not started -->
    <section v-if="!run" class="card flex flex-col gap-3">
      <p>{{ t('pr.notStarted', { month, n: staffCount }) }}</p>
      <label class="field max-w-xs">
        <span>{{ t('pr.rate') }}</span>
        <InputNumber v-model="newRate" :min="1" suffix=" ៛ / $1" @input="(e: any) => (newRate = e.value)" />
        <small class="text-[var(--k-muted)]">{{ t('fin.tax.nbcRateHint') }}</small>
      </label>
      <div class="flex flex-wrap gap-2">
        <Button :label="t('pr.start', { month })" icon="pi pi-play" :disabled="!staffCount" @click="start" />
        <RouterLink v-if="!staffCount" to="/staff" class="self-center text-sm font-semibold underline">{{ t('pr.addStaffFirst') }}</RouterLink>
      </div>
    </section>

    <template v-else>
      <Message v-if="missing.length && !locked" severity="info" :closable="false">
        <div class="flex flex-wrap items-center gap-2">
          <span class="flex-1">{{ t('pr.missing', { names: missing.map((x) => x.name).join(', ') }) }}</span>
          <Button :label="t('pr.addThem')" size="small" icon="pi pi-user-plus" @click="addMissing" />
        </div>
      </Message>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card flex flex-col gap-0.5">
          <span class="text-sm text-[var(--k-muted)]">{{ t('pr.taxTotal') }}</span>
          <span class="text-xl font-semibold tabular-nums">{{ m(s.taxTotal) }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ t('pr.dueShort', { date: s.eDueDate }) }}</span>
        </div>
        <div class="card flex flex-col gap-0.5">
          <span class="text-sm text-[var(--k-muted)]">{{ t('pr.nssfTotal') }}</span>
          <span class="text-xl font-semibold tabular-nums">{{ m(s.nssf.total) }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ t('pr.nStaff', { n: s.nssf.count }) }}</span>
        </div>
        <div class="card flex flex-col gap-0.5">
          <span class="text-sm text-[var(--k-muted)]">{{ t('pr.netTotal') }}</span>
          <span class="text-xl font-semibold tabular-nums">{{ m(s.net) }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ t('pr.nStaff', { n: lines.length }) }}</span>
        </div>
        <div class="card flex flex-col gap-0.5">
          <span class="text-sm text-[var(--k-muted)]">{{ t('fin.tax.employerCost') }}</span>
          <span class="text-xl font-semibold tabular-nums">{{ m(s.cost) }}</span>
        </div>
      </div>

      <!-- Staff this month -->
      <section class="card overflow-x-auto">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <h2 class="flex-1 font-semibold">{{ t('pr.staffList') }}</h2>
          <label v-if="hasUsd || !locked" class="flex items-center gap-2 text-sm">
            {{ t('pr.rateShort') }}
            <InputNumber :model-value="run.khr_per_usd" :min="1" suffix=" ៛" :disabled="locked" input-class="w-24" @blur="(e: any) => changeRate(Number(String(e.value).replace(/[^0-9]/g, '')))" />
          </label>
        </div>
        <table class="w-full min-w-[40rem] text-sm tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr>
              <th class="py-1 font-normal">{{ t('pr.name') }}</th>
              <th class="py-1 text-right font-normal">{{ t('fin.tax.salary') }}</th>
              <th class="py-1 text-right font-normal">{{ t('pr.extras') }}</th>
              <th class="py-1 text-right font-normal">{{ t('pr.taxShort') }}</th>
              <th class="py-1 text-right font-normal">{{ t('pr.pensionShort') }}</th>
              <th class="py-1 text-right font-normal">{{ t('fin.tax.net') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lines" :key="l.id" class="cursor-pointer border-t border-[var(--k-border)] hover:bg-[var(--k-border)]/30" @click="edit(l)">
              <td class="py-2">
                <span class="font-semibold">{{ l.name }}</span>
                <span class="block text-xs text-[var(--k-muted)]">{{ l.code }}<template v-if="!l.resident"> · {{ t('pr.nonResident') }}</template><template v-if="l.note"> · {{ l.note }}</template></span>
              </td>
              <td class="text-right">{{ formatMoney(l.salary, l.currency) }}</td>
              <td class="text-right">{{ l.bonus + l.seniority ? formatMoney(l.bonus + l.seniority, l.currency) : '' }}</td>
              <td class="text-right">{{ m(l.tax_khr) }}<span v-if="l.fbt_khr" class="block text-xs text-[var(--k-muted)]">FBT {{ m(l.fbt_khr) }}</span></td>
              <td class="text-right">{{ l.pension_khr ? m(l.pension_khr) : '' }}</td>
              <td class="text-right font-semibold">{{ formatMoney(netIn(l, run.khr_per_usd), l.currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!lines.length" class="py-4 text-center text-[var(--k-muted)]">{{ t('pr.noLines') }}</p>
        <p v-if="!locked" class="mt-2 text-xs text-[var(--k-muted)]">{{ t('pr.tapToEdit') }}</p>
      </section>

      <!-- GDT return -->
      <section class="card flex flex-col gap-2">
        <h2 class="font-semibold"><i class="pi pi-building-columns mr-1" />{{ t('pr.returnTitle') }}</h2>
        <dl class="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
          <dt>{{ t('pr.residentsLine', { n: s.residents.count }) }}</dt><dd class="text-right">{{ m(s.residents.tax) }}</dd>
          <dt class="pl-3 text-xs text-[var(--k-muted)]">{{ t('pr.baseOf', { gross: m(s.residents.gross), base: m(s.residents.base) }) }}</dt><dd />
          <template v-if="s.nonResidents.count">
            <dt>{{ t('pr.nonResidentsLine', { n: s.nonResidents.count }) }}</dt><dd class="text-right">{{ m(s.nonResidents.tax) }}</dd>
          </template>
          <template v-if="s.fringe.count">
            <dt>{{ t('pr.fbtLine', { n: s.fringe.count, value: m(s.fringe.value) }) }}</dt><dd class="text-right">{{ m(s.fringe.fbt) }}</dd>
          </template>
          <dt class="border-t border-[var(--k-border)] pt-1 font-semibold">{{ t('pr.taxTotal') }}</dt>
          <dd class="border-t border-[var(--k-border)] pt-1 text-right font-semibold">{{ m(s.taxTotal) }}</dd>
        </dl>
        <p class="text-sm"><i class="pi pi-calendar mr-1" />{{ t('pr.dueOn', { date: s.dueDate, edate: s.eDueDate }) }}</p>
        <dl class="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
          <dt class="font-semibold">{{ t('pr.nssfFor', { n: s.nssf.count }) }}</dt><dd />
          <dt class="pl-3">{{ t('pr.nssfEmployer') }}</dt><dd class="text-right">{{ m(s.nssf.risk + s.nssf.health + s.nssf.pensionEmployer) }}</dd>
          <dt class="pl-3">{{ t('pr.pensionEmployee') }}</dt><dd class="text-right">{{ m(s.nssf.pensionEmployee) }}</dd>
          <dt class="border-t border-[var(--k-border)] pt-1 font-semibold">{{ t('pr.nssfTotal') }}</dt>
          <dd class="border-t border-[var(--k-border)] pt-1 text-right font-semibold">{{ m(s.nssf.total) }}</dd>
        </dl>
      </section>

      <section class="flex flex-wrap gap-2">
        <Button :label="t('pr.printReturn')" icon="pi pi-print" outlined @click="print('return')" />
        <Button :label="t('pr.printPayslips')" icon="pi pi-file" outlined :disabled="!lines.length" @click="print('payslips')" />
        <Button :label="t('pr.exportCsv')" icon="pi pi-file-excel" outlined @click="exportCsv" />
        <span class="flex-1" />
        <template v-if="!locked">
          <Button :label="t('pr.refresh')" icon="pi pi-refresh" text @click="refresh" />
          <Button :label="t('pr.closeMonth')" icon="pi pi-lock" @click="close" />
          <Button :label="t('common.delete')" icon="pi pi-trash" text severity="danger" @click="remove" />
        </template>
        <Button v-else :label="t('pr.reopen')" icon="pi pi-lock-open" text @click="reopen" />
      </section>
      <p class="text-xs text-[var(--k-muted)]">{{ t('fin.tax.disclaimer') }}</p>

      <LineDialog v-model:open="lineOpen" :line="editing" :rate="run.khr_per_usd" :locked="locked" @saved="load" />
      <PrintSheet v-model:open="printing" :paper-mm="printKind === 'payslips' ? 148 : 210">
        <PayrollDocs :kind="printKind" :run="run" :lines="lines" :biz="pr.settings" />
      </PrintSheet>
    </template>
  </div>
</template>
