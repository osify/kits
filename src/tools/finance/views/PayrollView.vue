<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import Button from 'primevue/button'
import AmountField from '@/components/AmountField.vue'
import Stat from '../components/Stat.vue'
import RatesNote from '../components/RatesNote.vue'
import { persisted } from '../state'
import { grossForNet, payroll } from '../tax'
import { DEPENDENT_ALLOWANCE, EFILING_DAY, FILING_DAY, PENSION_FUND_FREE_PCT, SENIORITY_EXEMPT_HALF, SENIORITY_EXEMPT_YEAR } from '../rates'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** One employee, one month: GDT Tax on Salary + NSSF → net pay and employer cost. */
const { t } = useI18n()
const f = persisted('payroll', {
  salary: 5_000_000,
  currency: 'KHR' as 'KHR' | 'USD',
  rate: 4100,
  month: today().slice(0, 7),
  resident: true,
  children: 0,
  spouse: false,
  nssfCovered: true,
  fringe: 0,
  mode: 'gross' as 'gross' | 'net',
  wantNet: 0,
  more: false,
  bonus: 0,
  seniority: 0,
  seniorityTimes: 2 as 1 | 2,
  pensionFund: 0,
})
const modeOpts = computed(() => [
  { label: t('fin.tax.fromSalary'), value: 'gross' },
  { label: t('fin.tax.fromNet'), value: 'net' },
])
const timesOpts = computed(() => [
  { label: t('fin.tax.twiceYear'), value: 2 },
  { label: t('fin.tax.onceYear'), value: 1 },
])
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
const monthDate = computed({
  get: () => new Date(f.month + '-01T00:00:00'),
  set: (d: Date) => (f.month = today(d).slice(0, 7)),
})
/** Salary in riel: USD salaries convert at the NBC rate of the 15th of the month (GDT rule). */
const toKhr = (v: number) => (f.currency === 'KHR' ? v : Math.round((v / 100) * (f.rate || 4100)))
const extras = computed(() => ({
  month: f.month, resident: f.resident, children: f.children || 0, spouse: f.spouse, fringe: f.fringe, nssfCovered: f.nssfCovered,
  bonus: f.more ? toKhr(f.bonus) : 0, seniority: f.more ? toKhr(f.seniority) : 0, seniorityTimes: f.seniorityTimes, pensionFund: f.more ? toKhr(f.pensionFund) : 0,
}))
/** Salary in riel; in "take-home" mode it is the salary that gives the wanted net pay. */
const grossKhr = computed(() => (f.mode === 'net' ? grossForNet(toKhr(f.wantNet), extras.value) : toKhr(f.salary)))
const r = computed(() => payroll({ gross: grossKhr.value, ...extras.value }))
const m = (v: number) => formatMoney(v, 'KHR')
const usd = (v: number) => (f.currency === 'USD' ? ` · ${formatMoney(Math.round((v / (f.rate || 4100)) * 100), 'USD')}` : '')
const pct = (v: number) => `${v % 1 ? v.toFixed(1) : v}%`
const bandLabel = (from: number, to: number) => (Number.isFinite(to) ? `${(from / 1e6).toLocaleString('en-US')}–${(to / 1e6).toLocaleString('en-US')}M ៛` : `> ${(from / 1e6).toLocaleString('en-US')}M ៛`)
const printPage = () => window.print()
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[22rem_1fr]">
    <section class="no-print card flex flex-col gap-3 lg:self-start">
      <SelectButton v-model="f.mode" :options="modeOpts" option-label="label" option-value="value" :allow-empty="false" size="small" />
      <div class="field">
        <span>{{ f.mode === 'net' ? t('fin.tax.wantNet') : t('fin.tax.salary') }}</span>
        <div class="flex gap-2">
          <AmountField v-if="f.mode === 'net'" v-model="f.wantNet" :currency="f.currency" class="flex-1" />
          <AmountField v-else v-model="f.salary" :currency="f.currency" class="flex-1" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" size="small" />
        </div>
      </div>
      <label v-if="f.currency === 'USD'" class="field">
        <span>{{ t('fin.tax.nbcRate') }}</span>
        <InputNumber v-model="f.rate" :min="1000" :max="10000" suffix=" ៛" class="w-full" input-class="w-full" />
        <small class="text-[var(--k-muted)]">{{ t('fin.tax.nbcRateHint') }}</small>
      </label>
      <label class="field"><span>{{ t('fin.tax.month') }}</span><DatePicker v-model="monthDate" view="month" date-format="yy-mm" show-icon /></label>
      <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.resident" /> {{ t('fin.tax.resident') }}</label>
      <template v-if="f.resident">
        <label class="field">
          <span>{{ t('fin.tax.children') }}</span>
          <InputNumber v-model="f.children" :min="0" :max="20" show-buttons class="w-full" input-class="w-full" />
          <small class="text-[var(--k-muted)]">{{ t('fin.tax.childrenHint', { amount: m(DEPENDENT_ALLOWANCE) }) }}</small>
        </label>
        <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.spouse" /> {{ t('fin.tax.spouse') }}</label>
      </template>
      <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.nssfCovered" /> {{ t('fin.tax.nssfCovered') }}</label>
      <label class="field">
        <span>{{ t('fin.tax.fringe') }} <small class="text-[var(--k-muted)]">({{ t('fin.optional') }})</small></span>
        <AmountField v-model="f.fringe" currency="KHR" />
        <small class="text-[var(--k-muted)]">{{ t('fin.tax.fringeHint') }}</small>
      </label>
      <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.more" /> {{ t('fin.tax.morePay') }}</label>
      <template v-if="f.more">
        <label class="field">
          <span>{{ t('fin.tax.bonus') }} ({{ f.currency }})</span>
          <AmountField v-model="f.bonus" :currency="f.currency" />
          <small class="text-[var(--k-muted)]">{{ t('fin.tax.bonusHint') }}</small>
        </label>
        <label class="field">
          <span>{{ t('fin.tax.seniority') }} ({{ f.currency }})</span>
          <AmountField v-model="f.seniority" :currency="f.currency" />
          <SelectButton v-model="f.seniorityTimes" :options="timesOpts" option-label="label" option-value="value" :allow-empty="false" size="small" />
          <small class="text-[var(--k-muted)]">{{ t('fin.tax.seniorityHint', { year: m(SENIORITY_EXEMPT_YEAR), half: m(SENIORITY_EXEMPT_HALF) }) }}</small>
        </label>
        <label class="field">
          <span>{{ t('fin.tax.pensionFund') }} ({{ f.currency }})</span>
          <AmountField v-model="f.pensionFund" :currency="f.currency" />
          <small class="text-[var(--k-muted)]">{{ t('fin.tax.pensionFundHint', { pct: PENSION_FUND_FREE_PCT }) }}</small>
        </label>
      </template>
    </section>

    <section class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat hero :label="t('fin.tax.net')" :value="m(r.net)" :sub="usd(r.net).replace(' · ', '') || undefined" tone="good" />
        <Stat :label="t('fin.tax.salaryTax')" :value="m(r.tax.tax)" :sub="t('fin.tax.effective', { pct: r.tax.effectiveRate.toFixed(2) })" tone="warn" />
        <Stat :label="t('fin.tax.employerCost')" :value="m(r.employerCost)" :sub="usd(r.employerCost).replace(' · ', '') || undefined" />
      </div>

      <div class="card">
        <div class="mb-2 flex items-center">
          <h2 class="flex-1 font-semibold">{{ t('fin.tax.payslip') }}</h2>
          <Button icon="pi pi-print" :label="t('fin.print')" size="small" text class="no-print" @click="printPage" />
        </div>
        <dl class="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums">
          <dt>{{ t('fin.tax.salary') }}</dt><dd class="text-right">{{ m(grossKhr) }}{{ usd(grossKhr) }}</dd>
          <template v-if="extras.bonus">
            <dt>{{ t('fin.tax.bonus') }}</dt><dd class="text-right">{{ m(extras.bonus) }}</dd>
          </template>
          <template v-if="extras.seniority">
            <dt>{{ t('fin.tax.seniority') }}</dt><dd class="text-right">{{ m(extras.seniority) }}</dd>
            <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.seniorityExempt') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(r.seniority.exempt) }}</dd>
          </template>
          <template v-if="r.tax.pension">
            <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.pensionOff') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(r.tax.pension) }}</dd>
          </template>
          <template v-if="r.tax.allowances">
            <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.allowances') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(r.tax.allowances) }}</dd>
          </template>
          <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.taxBase') }}</dt><dd class="text-right text-[var(--k-muted)]">{{ m(r.tax.base) }}</dd>
          <dt>{{ t('fin.tax.salaryTax') }}</dt><dd class="text-right">−{{ m(r.tax.tax) }}</dd>
          <template v-if="r.nssf">
            <dt>{{ t('fin.tax.pensionEmployee', { pct: pct(r.nssf.rule.pensionEmployee) }) }}</dt><dd class="text-right">−{{ m(r.nssf.pensionEmployee) }}</dd>
          </template>
          <dt class="border-t border-[var(--k-border)] pt-1.5 font-semibold">{{ t('fin.tax.net') }}</dt>
          <dd class="border-t border-[var(--k-border)] pt-1.5 text-right font-semibold">{{ m(r.net) }}{{ usd(r.net) }}</dd>
        </dl>
      </div>

      <div class="card">
        <h2 class="mb-2 font-semibold">{{ t('fin.tax.bands') }}</h2>
        <table class="w-full text-sm tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr><th class="pb-1 font-normal">{{ t('fin.tax.band') }}</th><th class="pb-1 text-right font-normal">{{ t('fin.tax.rate') }}</th><th class="pb-1 text-right font-normal">{{ t('fin.tax.inBand') }}</th><th class="pb-1 text-right font-normal">{{ t('fin.tax.taxCol') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in r.tax.bands" :key="b.from" class="border-t border-[var(--k-border)]">
              <td class="py-1.5">{{ f.resident ? bandLabel(b.from, b.to) : t('fin.tax.nonResidentFlat') }}</td>
              <td class="text-right">{{ b.rate }}%</td>
              <td class="text-right">{{ m(b.taxable) }}</td>
              <td class="text-right font-semibold">{{ m(b.tax) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="r.nssf" class="card">
        <h2 class="mb-1 font-semibold">NSSF</h2>
        <p class="mb-2 text-xs text-[var(--k-muted)]">
          {{ t('fin.tax.nssfBase', { base: m(r.nssf.base), min: m(r.nssf.rule.minWage), max: m(r.nssf.rule.maxWage) }) }}
          <template v-if="r.nssf.rule.note"> · {{ r.nssf.rule.note }}</template>
        </p>
        <dl class="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums">
          <dt>{{ t('fin.tax.occupational', { pct: pct(r.nssf.rule.occupationalRisk) }) }}</dt><dd class="text-right">{{ m(r.nssf.occupationalRisk) }}</dd>
          <dt>{{ t('fin.tax.health', { pct: pct(r.nssf.rule.healthCare) }) }}</dt><dd class="text-right">{{ m(r.nssf.healthCare) }}</dd>
          <dt>{{ t('fin.tax.pensionEmployer', { pct: pct(r.nssf.rule.pensionEmployer) }) }}</dt><dd class="text-right">{{ m(r.nssf.pensionEmployer) }}</dd>
          <dt class="font-semibold">{{ t('fin.tax.employerPays') }}</dt><dd class="text-right font-semibold">{{ m(r.nssf.employerTotal) }}</dd>
          <dt class="text-[var(--k-muted)]">{{ t('fin.tax.pensionEmployee', { pct: pct(r.nssf.rule.pensionEmployee) }) }}</dt><dd class="text-right text-[var(--k-muted)]">{{ m(r.nssf.pensionEmployee) }}</dd>
          <dt class="border-t border-[var(--k-border)] pt-1.5">{{ t('fin.tax.nssfTotal') }}</dt>
          <dd class="border-t border-[var(--k-border)] pt-1.5 text-right">{{ m(r.nssf.employerTotal + r.nssf.pensionEmployee) }}</dd>
        </dl>
      </div>

      <div v-if="r.fbt" class="card flex flex-col gap-1 text-sm tabular-nums">
        <div v-if="f.fringe" class="flex justify-between"><span>{{ t('fin.tax.fringe') }}</span><span>{{ m(f.fringe) }}</span></div>
        <div v-if="r.pensionFund.excess" class="flex justify-between"><span>{{ t('fin.tax.pensionFundExcess', { pct: PENSION_FUND_FREE_PCT }) }}</span><span>{{ m(r.pensionFund.excess) }}</span></div>
        <div class="flex justify-between border-t border-[var(--k-border)] pt-1"><span>{{ t('fin.tax.fbt') }}</span><b>{{ m(r.fbt) }}</b></div>
      </div>
      <p class="text-sm"><i class="pi pi-calendar mr-1" />{{ t('fin.tax.deadline', { day: FILING_DAY, eday: EFILING_DAY }) }}</p>
      <p class="text-sm"><i class="pi pi-users mr-1" />{{ t('fin.tax.manyStaff') }} <a href="/payroll/" class="font-semibold underline">{{ t('pr.title') }}</a></p>

      <Message severity="secondary" :closable="false" class="text-sm">{{ t('fin.tax.disclaimer') }}</Message>
      <RatesNote />
    </section>
  </div>
</template>
