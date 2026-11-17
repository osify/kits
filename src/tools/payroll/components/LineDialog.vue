<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { computeLine, netIn, removeFromRun, updateLine, type Line } from '../db/data'
import { formatMoney } from '@/core/util/money'

/** This month's pay for one person: extras, deductions and their tax, with a live preview. */
const props = defineProps<{ line: Line | null; rate: number; locked: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const confirm = useConfirm()
const f = reactive({ salary: 0, bonus: 0, seniority: 0, seniority_times: 2, fringe: 0, pension_fund: 0, deduction: 0, note: '', resident: true, children: 0, spouse: false, nssf_covered: true })
watch(open, (v) => {
  const l = props.line
  if (!v || !l) return
  Object.assign(f, {
    salary: l.salary, bonus: l.bonus, seniority: l.seniority, seniority_times: l.seniority_times, fringe: l.fringe, pension_fund: l.pension_fund, deduction: l.deduction,
    note: l.note ?? '', resident: !!l.resident, children: l.children, spouse: !!l.spouse, nssf_covered: !!l.nssf_covered,
  })
})
const input = computed(() => ({ ...f, resident: f.resident ? 1 : 0, spouse: f.spouse ? 1 : 0, nssf_covered: f.nssf_covered ? 1 : 0, children: f.children || 0 }))
const preview = computed(() => (props.line ? computeLine({ ...props.line, ...input.value }, props.rate) : null))
const cur = computed(() => props.line?.currency ?? 'KHR')
const m = (v: number) => formatMoney(v, 'KHR')
const timesOpts = computed(() => [
  { label: t('fin.tax.twiceYear'), value: 2 },
  { label: t('fin.tax.onceYear'), value: 1 },
])
async function save() {
  if (!props.line) return
  await updateLine(db, props.line.id, { ...input.value, note: f.note.trim() || null })
  open.value = false
  emit('saved')
}
function remove() {
  confirm.require({
    message: t('pr.removeConfirm', { name: props.line?.name }),
    acceptProps: { label: t('pr.remove'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await removeFromRun(db, props.line!.id)
      open.value = false
      emit('saved')
    },
  })
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="line ? `${line.code} · ${line.name}` : ''" class="w-[min(40rem,calc(100vw-1rem))]">
    <div v-if="line" class="grid gap-4 md:grid-cols-2">
      <fieldset class="flex flex-col gap-3" :disabled="locked">
        <label class="field"><span>{{ t('fin.tax.salary') }} ({{ cur }})</span><AmountField v-model="f.salary" :currency="cur" /></label>
        <label class="field"><span>{{ t('fin.tax.bonus') }}</span><AmountField v-model="f.bonus" :currency="cur" /></label>
        <label class="field">
          <span>{{ t('fin.tax.seniority') }}</span><AmountField v-model="f.seniority" :currency="cur" />
          <SelectButton v-model="f.seniority_times" :options="timesOpts" option-label="label" option-value="value" :allow-empty="false" size="small" />
        </label>
        <label class="field"><span>{{ t('fin.tax.fringe') }}</span><AmountField v-model="f.fringe" :currency="cur" /></label>
        <label class="field"><span>{{ t('fin.tax.pensionFund') }}</span><AmountField v-model="f.pension_fund" :currency="cur" /></label>
        <label class="field">
          <span>{{ t('pr.deduction') }}</span><AmountField v-model="f.deduction" :currency="cur" />
          <small class="text-[var(--k-muted)]">{{ t('pr.deductionHint') }}</small>
        </label>
        <label class="field"><span>{{ t('pr.note') }}</span><InputText v-model="f.note" /></label>
        <details class="text-sm">
          <summary class="cursor-pointer text-[var(--k-muted)]">{{ t('pr.thisMonthStatus') }}</summary>
          <div class="mt-2 flex flex-col gap-2">
            <label class="flex items-center gap-2"><ToggleSwitch v-model="f.resident" /> {{ t('fin.tax.resident') }}</label>
            <label class="flex items-center gap-2">
              <InputNumber v-model="f.children" :min="0" :max="20" show-buttons input-class="w-14" @input="(e: any) => (f.children = e.value)" />
              {{ t('fin.tax.children') }}
            </label>
            <label class="flex items-center gap-2"><ToggleSwitch v-model="f.spouse" /> {{ t('fin.tax.spouse') }}</label>
            <label class="flex items-center gap-2"><ToggleSwitch v-model="f.nssf_covered" /> {{ t('fin.tax.nssfCovered') }}</label>
          </div>
        </details>
      </fieldset>
      <dl v-if="preview" class="grid h-fit grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-lg bg-[var(--k-border)]/30 p-3 text-sm tabular-nums">
        <dt>{{ t('pr.grossPaid') }}</dt><dd class="text-right">{{ m(preview.gross_khr) }}</dd>
        <template v-if="preview.gross_khr !== preview.taxable_khr">
          <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.seniorityExempt') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(preview.gross_khr - preview.taxable_khr) }}</dd>
        </template>
        <template v-if="preview.pension_khr">
          <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.pensionOff') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(preview.pension_khr) }}</dd>
        </template>
        <template v-if="preview.allowance_khr">
          <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.allowances') }}</dt><dd class="text-right text-[var(--k-muted)]">−{{ m(preview.allowance_khr) }}</dd>
        </template>
        <dt class="pl-3 text-[var(--k-muted)]">{{ t('fin.tax.taxBase') }}</dt><dd class="text-right text-[var(--k-muted)]">{{ m(preview.base_khr) }}</dd>
        <dt>{{ t('fin.tax.salaryTax') }}</dt><dd class="text-right">−{{ m(preview.tax_khr) }}</dd>
        <template v-if="preview.pension_khr">
          <dt>{{ t('pr.pensionEmployee') }}</dt><dd class="text-right">−{{ m(preview.pension_khr) }}</dd>
        </template>
        <template v-if="f.deduction">
          <dt>{{ t('pr.deduction') }}</dt><dd class="text-right">−{{ formatMoney(f.deduction, cur) }}</dd>
        </template>
        <dt class="border-t border-[var(--k-border)] pt-1.5 font-semibold">{{ t('fin.tax.net') }}</dt>
        <dd class="border-t border-[var(--k-border)] pt-1.5 text-right font-semibold">{{ formatMoney(netIn({ ...preview, currency: cur }, rate), cur) }}</dd>
        <template v-if="preview.fbt_khr">
          <dt class="text-[var(--k-muted)]">{{ t('fin.tax.fbt') }}</dt><dd class="text-right text-[var(--k-muted)]">{{ m(preview.fbt_khr) }}</dd>
        </template>
        <dt class="text-[var(--k-muted)]">{{ t('fin.tax.employerCost') }}</dt><dd class="text-right text-[var(--k-muted)]">{{ m(preview.cost_khr) }}</dd>
      </dl>
    </div>
    <template #footer>
      <Button v-if="!locked" :label="t('pr.remove')" text severity="danger" @click="remove" />
      <span class="flex-1" />
      <Button :label="locked ? t('common.close') : t('common.cancel')" text @click="open = false" />
      <Button v-if="!locked" :label="t('common.save')" icon="pi pi-check" @click="save" />
    </template>
  </Dialog>
</template>
