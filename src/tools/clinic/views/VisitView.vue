<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import AmountField from '@/components/AmountField.vue'
import QrCode from '@/components/QrCode.vue'
import PrintSheet from '@/tools/pos/components/PrintSheet.vue'
import RxDialog from '../components/RxDialog.vue'
import ClinicDoc from '../components/ClinicDoc.vue'
import ApptDialog, { type ApptPreset } from '../components/ApptDialog.vue'
import LevelTag from '../../health/components/LevelTag.vue'
import { db } from '../db'
import {
  addLine, deleteVisit, finishVisit, getPatient, getVisit, listLines, listRx, removeLine, removeRx, signedRxCode, updateLine, updateVisit, visitTotal,
  type Patient, type RxItemRow, type Visit, type VisitLine,
} from '../db/data'
import { bpLevel, tempLevel, spo2Level } from '../../health/rules'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** One check-up: vitals, notes, prescription, fees and payment, follow-up, printing and the pharmacy code. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const cl = useClinic()
const id = route.params.id as string
const v = ref<Visit | null>(null)
const p = ref<Patient | null>(null)
const rx = ref<RxItemRow[]>([])
const lines = ref<VisitLine[]>([])

async function load() {
  v.value = (await getVisit(db, id)) ?? null
  if (!v.value) return void router.replace('/')
  ;[p.value, rx.value, lines.value] = await Promise.all([getPatient(db, v.value.patient_id).then((x) => x ?? null), listRx(db, id), listLines(db, id)])
  follow.value = v.value.followup_date ? new Date(v.value.followup_date + 'T00:00:00') : null
}
onMounted(load)
const m = (x: number) => formatMoney(x, cl.currency)

// Every field is saved as it is typed (refresh-safe).
const timers: Record<string, number> = {}
function set<K extends keyof Visit>(k: K, val: Visit[K]) {
  if (!v.value) return
  v.value[k] = val
  clearTimeout(timers[k as string])
  timers[k as string] = window.setTimeout(() => updateVisit(db, id, { [k]: val } as any), 300)
}
const follow = ref<Date | null>(null)
function setFollow(d: Date | null) {
  follow.value = d
  set('followup_date', d ? today(d) : null)
}
// ── Doctor & room, follow-up booking ───────────────────────────────────────
const doctorOpts = computed(() => [
  { label: t('cl.sch.anyDoctor'), value: null },
  ...cl.doctors.filter((d) => d.active || d.id === v.value?.doctor_id).map((d) => ({ label: d.name, value: d.id })),
])
const roomOpts = computed(() => [{ label: t('cl.sch.noRoom'), value: null }, ...cl.rooms.filter((r) => r.active || r.id === v.value?.room_id).map((r) => ({ label: r.name, value: r.id }))])
async function setDoctor(doctorId: string | null) {
  const room = cl.doctor(doctorId)?.room_id
  const fillRoom = !!room && !v.value!.room_id
  v.value!.doctor_id = doctorId
  if (fillRoom) v.value!.room_id = room!
  await updateVisit(db, id, fillRoom ? { doctor_id: doctorId, room_id: room } : { doctor_id: doctorId })
}
/** Papers show the visit's doctor (else the clinic profile's). */
const clinicForDoc = computed(() => {
  const d = cl.doctor(v.value?.doctor_id)
  return d ? { ...cl.settings, doctor: d.name, license: d.license ?? '' } : cl.settings
})
const booking = ref(false)
const bookPreset = computed<ApptPreset>(() => ({ patient_id: v.value!.patient_id, doctor_id: v.value!.doctor_id, date: v.value!.followup_date ?? undefined, reason: t('cl.followup') }))
function followIn(days: number) {
  const d = new Date(v.value!.date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  setFollow(d)
}

// ── Prescription ─────────────────────────────────────────────────────────────
const rxOpen = ref(false)
const rxEdit = ref<RxItemRow | null>(null)
function editRx(i?: RxItemRow) {
  rxEdit.value = i ?? null
  rxOpen.value = true
}
async function delRx(i: RxItemRow) {
  await removeRx(db, i.id)
  await load()
}

// ── Fees & payment ───────────────────────────────────────────────────────────
const total = computed(() => visitTotal(lines.value, v.value?.discount ?? 0, cl.currency))
const feeOpts = computed(() => cl.services.map((s) => ({ label: `${s.name} · ${m(s.price)}`, value: s.id })))
const pick = ref<string | null>(null)
async function addFee(sid: string | null) {
  const s = cl.services.find((x) => x.id === sid)
  if (!s) return
  await addLine(db, id, { service_id: s.id, name: s.name, qty: 1, price: s.price })
  pick.value = null
  lines.value = await listLines(db, id)
}
const custom = reactive({ open: false, name: '', price: 0 })
async function addCustom() {
  if (!custom.name.trim()) return
  await addLine(db, id, { name: custom.name, qty: 1, price: custom.price })
  Object.assign(custom, { open: false, name: '', price: 0 })
  lines.value = await listLines(db, id)
}
async function lineQty(l: VisitLine, q: number | null) {
  if (!q || q <= 0) return
  await updateLine(db, l.id, { qty: q })
  lines.value = await listLines(db, id)
}
async function delLine(l: VisitLine) {
  await removeLine(db, l.id)
  lines.value = await listLines(db, id)
}
const METHODS = ['CASH', 'KHQR', 'CARD', 'OTHER']
const methodOpts = computed(() => METHODS.map((x) => ({ label: t(`cl.method.${x}`), value: x })))
function paidInFull() {
  set('paid', total.value)
  if (!v.value!.pay_method) set('pay_method', 'CASH')
}

async function toggleDone() {
  await finishVisit(db, id, v.value!.status !== 'DONE')
  await load()
  if (v.value!.status === 'DONE') {
    toast.add({ severity: 'success', summary: t('cl.visitDone'), life: 2000 })
    router.push('/')
  }
}
function remove() {
  confirm.require({
    message: t('cl.deleteVisitConfirm'),
    acceptProps: { label: t('hl.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteVisit(db, id)
      router.replace('/')
    },
  })
}

// ── Printing & pharmacy code ────────────────────────────────────────────────
const includeName = computed(() => cl.settings.rx_name === '1')
const code = ref('')
const fp = ref('')
/** Signed with this clinic's key, so pharmacies that trust the clinic see it as verified and unchanged. */
async function makeCode() {
  const r = await signedRxCode(db, id, { includeName: includeName.value })
  code.value = r?.code ?? ''
  fp.value = r?.fingerprint ?? ''
  v.value = (await getVisit(db, id)) ?? v.value
}
const printKind = ref<'rx' | 'summary' | 'receipt'>('rx')
const printing = ref(false)
async function print(kind: 'rx' | 'summary' | 'receipt') {
  if (kind === 'rx') await makeCode()
  printKind.value = kind
  printing.value = true
}
const share = ref(false)
async function openShare() {
  await makeCode()
  share.value = true
}
async function copyCode() {
  try {
    await navigator.clipboard.writeText(code.value)
    toast.add({ severity: 'success', summary: t('kx.copied'), life: 1500 })
  } catch {
    /* clipboard not allowed: the text is selectable */
  }
}
const ageYears = computed(() => (p.value?.birth_date && v.value ? Math.floor((Date.parse(v.value.date) - Date.parse(p.value.birth_date)) / 31_557_600_000) : null))
const num = (x: unknown) => (x === null || x === undefined || x === '' ? null : Number(x))
</script>

<template>
  <div v-if="v && p" class="flex flex-col gap-4">
    <div class="flex items-start gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.back()" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">
          <span class="mr-1 rounded-full bg-[var(--k-border)]/60 px-2 text-base">#{{ v.queue_no }}</span>
          <RouterLink :to="`/p/${p.id}`" class="hover:underline">{{ p.name }}</RouterLink>
        </h1>
        <p class="text-sm text-[var(--k-muted)]">
          <span class="font-mono">{{ p.code }}</span> · {{ [p.sex ? t(`hl.sex${p.sex}`) : '', ageYears !== null ? t('hl.years', { n: ageYears }) : '', v.date].filter(Boolean).join(' · ') }}
        </p>
      </div>
      <Tag :severity="v.status === 'DONE' ? 'success' : 'warn'" :value="v.status === 'DONE' ? t('cl.seenOne') : t('cl.waiting')" />
    </div>
    <div v-if="cl.doctors.length || cl.rooms.length" class="grid grid-cols-2 gap-2 sm:max-w-md">
      <label v-if="cl.doctors.length" class="field"><span>{{ t('cl.sch.doctor') }}</span><Select :model-value="v.doctor_id" :options="doctorOpts" :placeholder="t('cl.sch.anyDoctor')" option-label="label" option-value="value" @update:model-value="setDoctor" /></label>
      <label v-if="cl.rooms.length" class="field"><span>{{ t('cl.sch.room') }}</span><Select :model-value="v.room_id" :options="roomOpts" :placeholder="t('cl.sch.noRoom')" option-label="label" option-value="value" @update:model-value="(r: string | null) => set('room_id', r)" /></label>
    </div>
    <p v-if="p.allergies" class="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">
      <i class="pi pi-exclamation-triangle mr-1" />{{ t('hl.allergies') }}: {{ p.allergies }}
    </p>

    <!-- Vitals -->
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('cl.vitals') }}</h2>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="field">
          <span>{{ t('hl.kind.BP') }}</span>
          <div class="flex items-center gap-1">
            <InputNumber :model-value="v.bp_sys" :min="40" :max="300" input-class="w-full" class="flex-1" placeholder="120" :aria-label="t('hl.systolic')" @input="(e: any) => set('bp_sys', num(e.value) as any)" />
            /
            <InputNumber :model-value="v.bp_dia" :min="20" :max="200" input-class="w-full" class="flex-1" placeholder="80" :aria-label="t('hl.diastolic')" @input="(e: any) => set('bp_dia', num(e.value) as any)" />
          </div>
          <LevelTag v-if="v.bp_sys && v.bp_dia" :level="bpLevel(v.bp_sys, v.bp_dia)" class="self-start" />
        </div>
        <label class="field"><span>{{ t('hl.kind.PULSE') }}</span><InputNumber :model-value="v.pulse" :min="20" :max="250" input-class="w-full" @input="(e: any) => set('pulse', num(e.value) as any)" /></label>
        <div class="field">
          <span>{{ t('hl.kind.TEMP') }} (°C)</span>
          <InputNumber :model-value="v.temp" :min="30" :max="45" :max-fraction-digits="1" input-class="w-full" @input="(e: any) => set('temp', num(e.value) as any)" />
          <LevelTag v-if="v.temp" :level="tempLevel(v.temp)" class="self-start" />
        </div>
        <label class="field"><span>{{ t('hl.kind.WEIGHT') }} (kg)</span><InputNumber :model-value="v.weight" :min="0" :max="400" :max-fraction-digits="1" input-class="w-full" @input="(e: any) => set('weight', num(e.value) as any)" /></label>
        <div class="field">
          <span>SpO₂ (%)</span>
          <InputNumber :model-value="v.spo2" :min="50" :max="100" input-class="w-full" @input="(e: any) => set('spo2', num(e.value) as any)" />
          <LevelTag v-if="v.spo2" :level="spo2Level(v.spo2)" class="self-start" />
        </div>
        <label class="field"><span>{{ t('hl.kind.GLUCOSE') }} (mg/dL)</span><InputNumber :model-value="v.glucose" :min="10" :max="900" input-class="w-full" @input="(e: any) => set('glucose', num(e.value) as any)" /></label>
      </div>
    </section>

    <!-- Notes (private) -->
    <section class="card flex flex-col gap-3">
      <h2 class="font-semibold"><i class="pi pi-lock mr-1 text-[var(--k-muted)]" />{{ t('cl.notes') }}</h2>
      <label class="field"><span>{{ t('cl.complaint') }}</span><Textarea :model-value="v.complaint ?? ''" rows="2" auto-resize @update:model-value="(x: string) => set('complaint', x)" /></label>
      <label class="field"><span>{{ t('cl.exam') }}</span><Textarea :model-value="v.exam ?? ''" rows="2" auto-resize @update:model-value="(x: string) => set('exam', x)" /></label>
      <label class="field"><span>{{ t('cl.diagnosis') }}</span><InputText :model-value="v.diagnosis ?? ''" @update:model-value="(x: string | undefined) => set('diagnosis', x ?? '')" /></label>
      <label class="field"><span>{{ t('cl.plan') }}</span><Textarea :model-value="v.plan ?? ''" rows="2" auto-resize @update:model-value="(x: string) => set('plan', x)" /></label>
    </section>

    <!-- Prescription -->
    <section class="card flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold">{{ t('cl.prescription') }}</h2>
        <Button :label="t('cl.addRx')" icon="pi pi-plus" size="small" @click="editRx()" />
      </div>
      <p v-if="!rx.length" class="text-sm text-[var(--k-muted)]">{{ t('cl.noRx') }}</p>
      <ul v-else class="flex flex-col divide-y divide-[var(--k-border)]">
        <li v-for="i in rx" :key="i.id" class="flex items-center gap-2 py-2">
          <button type="button" class="min-w-0 flex-1 text-left" @click="editRx(i)">
            <span class="block font-semibold">{{ i.name }}<span v-if="i.qty" class="font-normal text-[var(--k-muted)]"> — {{ i.qty }} {{ i.unit ?? '' }}</span></span>
            <span class="block text-xs text-[var(--k-muted)]">
              {{ [i.dose, i.times ? t('cl.timesDay', { n: i.times }) : '', i.days ? t('cl.forDays', { n: i.days }) : '', i.note].filter(Boolean).join(' · ') }}
            </span>
          </button>
          <Button icon="pi pi-trash" text rounded severity="secondary" size="small" :aria-label="t('hl.delete')" @click="delRx(i)" />
        </li>
      </ul>
      <div v-if="rx.length" class="flex flex-wrap gap-2 border-t border-[var(--k-border)] pt-2">
        <Button :label="t('cl.printRx')" icon="pi pi-print" outlined size="small" @click="print('rx')" />
        <Button :label="t('cl.shareRx')" icon="pi pi-qrcode" outlined size="small" @click="openShare" />
      </div>
    </section>

    <!-- Fees -->
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('cl.fees') }}</h2>
      <ul class="flex flex-col divide-y divide-[var(--k-border)]">
        <li v-for="l in lines" :key="l.id" class="flex items-center gap-2 py-1.5">
          <span class="min-w-0 flex-1 truncate">{{ l.name }}</span>
          <InputNumber :model-value="l.qty" :min="0.5" :max="9999" :max-fraction-digits="1" input-class="w-16 text-right" :aria-label="t('cl.qty')" @update:model-value="(q: number | null) => lineQty(l, q)" />
          <span class="w-28 text-right tabular-nums">{{ m(Math.round(l.qty * l.price)) }}</span>
          <Button icon="pi pi-times" text rounded severity="secondary" size="small" :aria-label="t('hl.delete')" @click="delLine(l)" />
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <Select v-model="pick" :options="feeOpts" option-label="label" option-value="value" :placeholder="t('cl.addFee')" filter class="min-w-0 flex-1" @update:model-value="addFee" />
        <Button :label="t('cl.otherFee')" icon="pi pi-plus" text @click="custom.open = true" />
      </div>
      <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-[var(--k-border)] pt-2 text-sm">
        <span>{{ t('cl.discount') }}</span>
        <AmountField :model-value="v.discount" :currency="cl.currency" class="w-36" @update:model-value="(x: number) => set('discount', x || 0)" />
        <b class="text-base">{{ t('cl.total') }}</b>
        <b class="text-right text-lg tabular-nums">{{ m(total) }}</b>
        <span>{{ t('cl.paidLabel') }}</span>
        <div class="flex items-center gap-2">
          <Button :label="t('cl.paidFull')" size="small" text @click="paidInFull" />
          <AmountField :model-value="v.paid" :currency="cl.currency" class="w-36" @update:model-value="(x: number) => set('paid', x || 0)" />
        </div>
      </div>
      <SelectButton :model-value="v.pay_method" :options="methodOpts" option-label="label" option-value="value" class="flex-wrap" @update:model-value="(x: string) => set('pay_method', x)" />
      <p v-if="total > v.paid" class="text-sm font-semibold text-amber-700 dark:text-amber-400">{{ t('cl.owes', { amount: m(total - v.paid) }) }}</p>
    </section>

    <!-- Follow-up & finish -->
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('cl.followup') }}</h2>
      <div class="flex flex-wrap items-center gap-2">
        <DatePicker :model-value="follow" date-format="yy-mm-dd" show-icon show-clear class="w-44" @update:model-value="(d: any) => setFollow(d)" />
        <Button v-for="n in [3, 7, 14, 30]" :key="n" :label="t('hl.forDays', { n })" size="small" text @click="followIn(n)" />
      </div>
      <Button :label="t('cl.sch.bookFollowup')" icon="pi pi-calendar-plus" outlined size="small" class="self-start" @click="booking = true" />
      <p class="text-xs text-[var(--k-muted)]">{{ t('cl.sch.bookFollowupHint') }}</p>
    </section>

    <div class="flex flex-wrap gap-2">
      <Button :label="v.status === 'DONE' ? t('cl.reopenVisit') : t('cl.finishVisit')" :icon="v.status === 'DONE' ? 'pi pi-replay' : 'pi pi-check'" :outlined="v.status === 'DONE'" @click="toggleDone" />
      <Button :label="t('cl.printSummary')" icon="pi pi-print" outlined @click="print('summary')" />
      <Button :label="t('cl.printReceipt')" icon="pi pi-receipt" outlined @click="print('receipt')" />
      <span class="flex-1" />
      <Button :label="t('cl.deleteVisit')" icon="pi pi-trash" text severity="danger" @click="remove" />
    </div>

    <ApptDialog v-model:open="booking" :preset="bookPreset" @changed="() => {}" />
    <RxDialog v-model:open="rxOpen" :visit-id="id" :item="rxEdit" @saved="load" />

    <Dialog v-model:visible="custom.open" modal :header="t('cl.otherFee')" class="w-[min(22rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="addCustom">
        <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="custom.name" autofocus /></label>
        <label class="field"><span>{{ t('cl.price') }}</span><AmountField v-model="custom.price" :currency="cl.currency" /></label>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="custom.open = false" />
          <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!custom.name.trim()" />
        </div>
      </form>
    </Dialog>

    <Dialog v-model:visible="share" modal :header="t('cl.shareRx')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col items-center gap-3">
        <QrCode v-if="code" :text="code" :size="240" :label="t('kx.codeLabel')" />
        <p class="text-center text-sm">{{ t('cl.shareHint') }}</p>
        <label class="flex items-center gap-2 self-start text-sm">
          <ToggleSwitch :model-value="includeName" @update:model-value="async (x: boolean) => { await cl.set('rx_name', x ? '1' : '0'); await makeCode() }" />
          {{ t('cl.includeName') }}
        </label>
        <p class="self-start text-xs text-[var(--k-muted)]"><i class="pi pi-shield mr-1" />{{ t('cl.shareContains') }}</p>
        <p v-if="fp" class="self-start text-xs"><i class="pi pi-verified mr-1 text-primary-600" />{{ t('kx.signedBy', { fp }) }}</p>
        <textarea readonly class="w-full rounded-lg border border-[var(--k-border)] bg-transparent p-2 font-mono text-xs" rows="3" :value="code" />
        <Button :label="t('kx.copy')" icon="pi pi-copy" outlined class="self-start" @click="copyCode" />
      </div>
    </Dialog>

    <PrintSheet v-model:open="printing" :paper-mm="148">
      <ClinicDoc
        :kind="printKind"
        :clinic="clinicForDoc"
        :patient="p"
        :visit="v"
        :rx="rx"
        :lines="lines"
        :total="total"
        :currency="cl.currency"
        :code="code"
        :fp="fp"
        :show-name="includeName"
      />
    </PrintSheet>
  </div>
</template>
