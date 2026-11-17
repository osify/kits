<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { deleteStaff, listStaff, saveStaff, type Staff } from '../db/data'
import { usePayroll } from '../store'
import { formatMoney, type Currency } from '@/core/util/money'
import { today } from '@/core/util/date'

/** The staff list: usual salary, residency, dependants and NSSF, used to start each month. */
const { t } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const pr = usePayroll()
const rows = ref<Staff[]>([])
const load = async () => (rows.value = await listStaff(db))
onMounted(load)
const todayStr = today()
const left = (s: Staff) => !!s.end_date && s.end_date < todayStr

const open = ref(false)
const blank = () => ({
  id: undefined as string | undefined, name: '', name_latin: '', sex: null as 'M' | 'F' | null, position: '', nationality: 'Khmer', id_no: '', nssf_no: '', phone: '', bank: '',
  resident: true, children: 0, spouse: false, nssf_covered: true, salary: 0, currency: pr.currency as Currency, start: null as Date | null, end: null as Date | null, note: '',
})
const f = reactive(blank())
const toDate = (s: string | null) => (s ? new Date(s + 'T00:00:00') : null)
function edit(s?: Staff) {
  Object.assign(f, blank())
  if (s)
    Object.assign(f, {
      ...s, name_latin: s.name_latin ?? '', position: s.position ?? '', nationality: s.nationality ?? '', id_no: s.id_no ?? '', nssf_no: s.nssf_no ?? '', phone: s.phone ?? '',
      bank: s.bank ?? '', note: s.note ?? '', resident: !!s.resident, spouse: !!s.spouse, nssf_covered: !!s.nssf_covered, start: toDate(s.start_date), end: toDate(s.end_date),
    })
  open.value = true
}
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
const sexOpts = [
  { label: t('hl.sexM'), value: 'M' },
  { label: t('hl.sexF'), value: 'F' },
]
async function save() {
  if (!f.name.trim()) return
  await saveStaff(db, {
    ...f, resident: f.resident ? 1 : 0, spouse: f.spouse ? 1 : 0, nssf_covered: f.nssf_covered ? 1 : 0, children: f.children || 0,
    start_date: f.start ? today(f.start) : null, end_date: f.end ? today(f.end) : null,
  })
  open.value = false
  await load()
}
function remove() {
  confirm.require({
    message: t('pr.deleteStaffConfirm', { name: f.name }),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      try {
        await deleteStaff(db, f.id!)
        open.value = false
        await load()
      } catch {
        toast.add({ severity: 'warn', summary: t('pr.onPayroll'), life: 5000 })
      }
    },
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('pr.nav.staff') }}</h1>
      <Button :label="t('pr.newStaff')" icon="pi pi-user-plus" @click="edit()" />
    </div>
    <p class="text-sm text-[var(--k-muted)]">{{ t('pr.staffHint') }}</p>
    <p v-if="!rows.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('pr.noStaff') }}</p>
    <ul v-else class="flex flex-col divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="s in rows" :key="s.id">
        <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" :class="{ 'opacity-50': left(s) }" @click="edit(s)">
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ s.name }}</span>
            <span class="block truncate text-xs text-[var(--k-muted)]">
              {{ [s.code, s.position, !s.resident ? t('pr.nonResident') : '', s.children + s.spouse ? t('pr.dependants', { n: s.children + s.spouse }) : '', !s.nssf_covered ? t('pr.noNssf') : '', left(s) ? t('pr.leftOn', { date: s.end_date }) : ''].filter(Boolean).join(' · ') }}
            </span>
          </span>
          <span class="tabular-nums">{{ formatMoney(s.salary, s.currency) }}</span>
        </button>
      </li>
    </ul>

    <Dialog v-model:visible="open" modal :header="f.id ? t('pr.editStaff') : t('pr.newStaff')" class="w-[min(36rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field"><span>{{ t('pr.name') }}</span><InputText v-model="f.name" autofocus /></label>
          <label class="field"><span>{{ t('pr.nameLatin') }}</span><InputText v-model="f.name_latin" /></label>
          <label class="field"><span>{{ t('pr.position') }}</span><InputText v-model="f.position" /></label>
          <div class="field"><span>{{ t('hl.sex') }}</span><SelectButton v-model="f.sex" :options="sexOpts" option-label="label" option-value="value" /></div>
        </div>
        <div class="field">
          <span>{{ t('pr.usualSalary') }}</span>
          <div class="flex gap-2">
            <AmountField v-model="f.salary" :currency="f.currency" class="flex-1" />
            <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" size="small" />
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.resident" /> {{ t('fin.tax.resident') }}</label>
        <div v-if="f.resident" class="grid gap-3 sm:grid-cols-2">
          <label class="field"><span>{{ t('fin.tax.children') }}</span><InputNumber v-model="f.children" :min="0" :max="20" show-buttons @input="(e: any) => (f.children = e.value)" /></label>
          <label class="flex items-center gap-2 self-end pb-2 text-sm"><ToggleSwitch v-model="f.spouse" /> {{ t('fin.tax.spouse') }}</label>
        </div>
        <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.nssf_covered" /> {{ t('fin.tax.nssfCovered') }}</label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field"><span>{{ t('pr.nationality') }}</span><InputText v-model="f.nationality" /></label>
          <label class="field"><span>{{ t('pr.idNo') }}</span><InputText v-model="f.id_no" /></label>
          <label class="field"><span>{{ t('pr.nssfNo') }}</span><InputText v-model="f.nssf_no" /></label>
          <label class="field"><span>{{ t('pr.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
          <label class="field"><span>{{ t('pr.startDate') }}</span><DatePicker v-model="f.start" date-format="yy-mm-dd" show-icon show-clear /></label>
          <label class="field"><span>{{ t('pr.endDate') }}</span><DatePicker v-model="f.end" date-format="yy-mm-dd" show-icon show-clear /></label>
        </div>
        <label class="field"><span>{{ t('pr.bank') }}</span><InputText v-model="f.bank" :placeholder="t('pr.bankPh')" /></label>
        <label class="field"><span>{{ t('pr.note') }}</span><InputText v-model="f.note" /></label>
      </div>
      <template #footer>
        <Button v-if="f.id" :label="t('common.delete')" text severity="danger" @click="remove" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
