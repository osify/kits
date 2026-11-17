<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import PatientDialog from './PatientDialog.vue'
import { db } from '../db'
import {
  checkIn, deleteAppointment, getPatient, listAppointments, listPatients, saveAppointment, setAppointmentStatus,
  type ApptRow, type Patient, type PatientRow,
} from '../db/data'
import { clashes, DURATIONS, freeSlots, parseHours, toMin } from '../schedule'
import { useClinic } from '../store'
import { today } from '@/core/util/date'

/** Book or change an appointment: patient, doctor, room, day, time, length. Clashes warn, never block. */
export interface ApptPreset {
  patient_id?: string
  doctor_id?: string | null
  room_id?: string | null
  date?: string
  start?: string
  reason?: string
}
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ appt?: ApptRow | null; preset?: ApptPreset | null }>()
const emit = defineEmits<{ changed: []; checkedIn: [visitId: string] }>()
const { t } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const cl = useClinic()

const f = reactive({
  patient: null as Patient | null,
  doctor_id: null as string | null,
  room_id: null as string | null,
  date: new Date(),
  start: '08:00',
  minutes: 15,
  reason: '',
  note: '',
})
const dayStr = computed(() => today(f.date))
const dayAppts = ref<ApptRow[]>([])
const q = ref('')
const found = ref<PatientRow[]>([])
const adding = ref(false)

let filling = false
watch(open, async (v) => {
  if (!v) return
  filling = true
  const a = props.appt
  const p = props.preset ?? {}
  const pid = a?.patient_id ?? p.patient_id
  const doc = cl.doctor(a?.doctor_id ?? p.doctor_id) ?? (cl.activeDoctors.length === 1 ? cl.activeDoctors[0] : undefined)
  Object.assign(f, {
    patient: pid ? ((await getPatient(db, pid)) ?? null) : null,
    doctor_id: a ? a.doctor_id : (doc?.id ?? null),
    room_id: a ? a.room_id : (p.room_id ?? doc?.room_id ?? null),
    date: new Date((a?.date ?? p.date ?? today()) + 'T00:00:00'),
    start: a?.start ?? p.start ?? '',
    minutes: a?.minutes ?? doc?.slot_min ?? 15,
    reason: a?.reason ?? p.reason ?? '',
    note: a?.note ?? '',
  })
  q.value = ''
  if (!f.patient) search()
  await loadDay()
  filling = false
  if (!f.start) f.start = slots.value[0] ?? '08:00'
})
async function loadDay() {
  dayAppts.value = await listAppointments(db, dayStr.value, dayStr.value)
}
watch(dayStr, () => open.value && loadDay())

let timer = 0
watch(q, () => {
  clearTimeout(timer)
  timer = window.setTimeout(search, 150)
})
async function search() {
  found.value = await listPatients(db, q.value)
}
async function pickPatient(id: string) {
  f.patient = (await getPatient(db, id)) ?? null
}

const doctor = computed(() => cl.doctor(f.doctor_id))
const hours = computed(() => parseHours(doctor.value?.hours))
watch(
  () => f.doctor_id,
  (id, old) => {
    if (!open.value || filling || id === old) return
    const d = cl.doctor(id)
    if (d?.room_id && (!f.room_id || f.room_id === cl.doctor(old)?.room_id)) f.room_id = d.room_id
    if (d && !props.appt) f.minutes = d.slot_min
  },
)
const doctorOpts = computed(() => [
  { label: t('cl.sch.anyDoctor'), value: null },
  ...cl.doctors.filter((d) => d.active || d.id === f.doctor_id).map((d) => ({ label: d.title ? `${d.name} · ${d.title}` : d.name, value: d.id })),
])
const roomOpts = computed(() => [{ label: t('cl.sch.noRoom'), value: null }, ...cl.rooms.filter((r) => r.active || r.id === f.room_id).map((r) => ({ label: r.name, value: r.id }))])
const minuteOpts = computed(() => [...new Set([...DURATIONS, f.minutes])].sort((a, b) => a - b).map((m) => ({ label: t('cl.sch.min', { n: m }), value: m })))

/** Next free times of the chosen doctor that day (none without a doctor or hours). */
const slots = computed(() => {
  if (!doctor.value) return []
  const mine = dayAppts.value.filter((a) => a.doctor_id === f.doctor_id && a.id !== props.appt?.id)
  const now = new Date()
  const after = dayStr.value === today() ? now.getHours() * 60 + now.getMinutes() : -1
  return freeSlots(hours.value, dayStr.value, f.minutes, mine, doctor.value.slot_min || f.minutes, after).slice(0, 16)
})
const problems = computed(() => {
  if (!/^\d\d:\d\d$/.test(f.start)) return []
  const me = { id: props.appt?.id, date: dayStr.value, start: f.start, minutes: f.minutes, doctor_id: f.doctor_id, room_id: f.room_id, patient_id: f.patient?.id }
  return clashes(me, dayAppts.value, doctor.value ? hours.value : undefined).map((c) => {
    const w = c.with as ApptRow | undefined
    return t(`cl.sch.clash.${c.kind}`, { time: w?.start ?? '', name: w?.name ?? '', doctor: doctor.value?.name ?? '', room: cl.room(f.room_id)?.name ?? '' })
  })
})
const past = computed(() => dayStr.value < today() || (dayStr.value === today() && toMin(f.start) < new Date().getHours() * 60 + new Date().getMinutes() - 60))

const valid = computed(() => !!f.patient && /^\d\d:\d\d$/.test(f.start) && f.minutes > 0)
async function save() {
  if (!valid.value) return
  await saveAppointment(db, {
    id: props.appt?.id, patient_id: f.patient!.id, doctor_id: f.doctor_id, room_id: f.room_id, date: dayStr.value, start: f.start, minutes: f.minutes, reason: f.reason, note: f.note,
  })
  toast.add({ severity: 'success', summary: t('cl.sch.booked'), life: 1500 })
  open.value = false
  emit('changed')
}
async function arrive() {
  await save()
  const vid = await checkIn(db, props.appt!.id, cl.settings.consult_service || null)
  if (vid) emit('checkedIn', vid)
}
async function status(s: 'BOOKED' | 'CANCELLED' | 'NO_SHOW') {
  await setAppointmentStatus(db, props.appt!.id, s)
  open.value = false
  emit('changed')
}
function remove() {
  confirm.require({
    message: t('cl.sch.deleteConfirm'),
    acceptProps: { label: t('hl.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteAppointment(db, props.appt!.id)
      open.value = false
      emit('changed')
    },
  })
}

/** Reminder for the patient (Telegram / SMS): clinic, day, time, doctor, room, phone. No medical details. */
const reminder = computed(() => {
  const lines = [
    t('cl.sch.remHello', { name: f.patient?.name ?? '' }),
    t('cl.sch.remWhen', { clinic: cl.name, date: dayStr.value, time: f.start }),
    doctor.value ? `${t('cl.sch.doctor')}: ${doctor.value.name}` : '',
    cl.room(f.room_id) ? `${t('cl.sch.room')}: ${cl.room(f.room_id)!.name}` : '',
    [cl.settings.address, cl.settings.phone].filter(Boolean).join(' · '),
  ]
  return lines.filter(Boolean).join('\n')
})
async function share() {
  try {
    if (navigator.share) await navigator.share({ text: reminder.value })
    else {
      await navigator.clipboard.writeText(reminder.value)
      toast.add({ severity: 'success', summary: t('kx.copied'), life: 1500 })
    }
  } catch {
    /* cancelled or not allowed */
  }
}
const statusTag = computed(() => {
  const a = props.appt
  if (!a) return null
  if (a.status === 'ARRIVED') return { sev: a.visit_status === 'DONE' ? 'success' : 'warn', label: a.visit_status === 'DONE' ? t('cl.seenOne') : t('cl.sch.status.ARRIVED') }
  return { sev: a.status === 'BOOKED' ? 'info' : 'secondary', label: t(`cl.sch.status.${a.status}`) }
})
</script>

<template>
  <Dialog v-model:visible="open" modal :header="appt ? t('cl.sch.editAppt') : t('cl.sch.book')" class="w-[min(32rem,calc(100vw-1rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <Tag v-if="statusTag" :severity="statusTag.sev" :value="statusTag.label" class="self-start" />
      <!-- patient -->
      <div v-if="f.patient" class="flex items-center gap-3 rounded-lg bg-[var(--k-border)]/40 px-3 py-2">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ f.patient.name }}</span>
          <span class="block text-xs text-[var(--k-muted)]">{{ [f.patient.code, f.patient.phone].filter(Boolean).join(' · ') }}</span>
        </span>
        <Button v-if="!appt?.visit_id" :label="t('cl.sch.change')" text size="small" @click="f.patient = null; search()" />
      </div>
      <div v-else class="flex flex-col gap-2">
        <InputText v-model="q" :placeholder="t('cl.searchPatient')" autofocus />
        <Button :label="q.trim() ? t('cl.addNamed', { name: q.trim() }) : t('cl.newPatient')" icon="pi pi-user-plus" outlined size="small" class="self-start" @click="adding = true" />
        <ul class="max-h-48 divide-y divide-[var(--k-border)] overflow-y-auto">
          <li v-for="p in found" :key="p.id">
            <button type="button" class="flex w-full items-center gap-3 px-1 py-1.5 text-left hover:bg-[var(--k-border)]/40" @click="pickPatient(p.id)">
              <span class="w-16 shrink-0 font-mono text-xs text-[var(--k-muted)]">{{ p.code }}</span>
              <span class="min-w-0 flex-1 truncate">{{ p.name }}<span v-if="p.phone" class="text-xs text-[var(--k-muted)]"> · {{ p.phone }}</span></span>
            </button>
          </li>
        </ul>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('cl.sch.doctor') }}</span><Select v-model="f.doctor_id" :options="doctorOpts" :placeholder="t('cl.sch.anyDoctor')" option-label="label" option-value="value" /></label>
        <label class="field"><span>{{ t('cl.sch.room') }}</span><Select v-model="f.room_id" :options="roomOpts" :placeholder="t('cl.sch.noRoom')" option-label="label" option-value="value" /></label>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_9rem_8rem]">
        <label class="field col-span-2 sm:col-span-1"><span>{{ t('cl.sch.day') }}</span><DatePicker v-model="f.date" date-format="yy-mm-dd" show-icon :disabled="!!appt?.visit_id" /></label>
        <label class="field"><span>{{ t('cl.sch.time') }}</span><InputText v-model="f.start" type="time" step="300" class="w-full" /></label>
        <label class="field"><span>{{ t('cl.sch.length') }}</span><Select v-model="f.minutes" :options="minuteOpts" option-label="label" option-value="value" class="w-full" /></label>
      </div>
      <div v-if="doctor" class="flex flex-col gap-1">
        <span class="text-xs text-[var(--k-muted)]">{{ slots.length ? t('cl.sch.freeTimes', { name: doctor.name }) : t('cl.sch.noFree', { name: doctor.name }) }}</span>
        <div v-if="slots.length" class="flex flex-wrap gap-1">
          <button
            v-for="s in slots"
            :key="s"
            type="button"
            class="rounded-md border px-2 py-0.5 text-sm tabular-nums"
            :class="s === f.start ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--k-border)] hover:bg-[var(--k-border)]/40'"
            @click="f.start = s"
          >
            {{ s }}
          </button>
        </div>
      </div>
      <Message v-for="(p, i) in problems" :key="i" severity="warn" size="small" :closable="false">{{ p }}</Message>
      <Message v-if="past && !appt" severity="secondary" size="small" :closable="false">{{ t('cl.sch.inPast') }}</Message>

      <label class="field"><span>{{ t('cl.sch.reason') }}</span><InputText v-model="f.reason" :placeholder="t('cl.sch.reasonPh')" /></label>
      <label class="field"><span>{{ t('hl.note') }}</span><Textarea v-model="f.note" rows="1" auto-resize /></label>

      <div class="flex flex-wrap items-center gap-2 border-t border-[var(--k-border)] pt-3">
        <template v-if="appt">
          <Button v-if="appt.status === 'BOOKED'" :label="t('cl.sch.checkIn')" icon="pi pi-sign-in" severity="success" @click="arrive" />
          <Button v-if="appt.visit_id" :label="t('cl.sch.openVisit')" icon="pi pi-external-link" outlined @click="emit('checkedIn', appt.visit_id); open = false" />
          <Button v-if="appt.status === 'BOOKED'" :label="t('cl.sch.status.NO_SHOW')" text severity="secondary" size="small" @click="status('NO_SHOW')" />
          <Button v-if="appt.status === 'BOOKED'" :label="t('cl.sch.cancelAppt')" text severity="secondary" size="small" @click="status('CANCELLED')" />
          <Button v-if="appt.status === 'CANCELLED' || appt.status === 'NO_SHOW'" :label="t('cl.sch.restore')" icon="pi pi-replay" text size="small" @click="status('BOOKED')" />
          <Button v-if="!appt.visit_id" icon="pi pi-trash" text rounded severity="danger" size="small" :aria-label="t('hl.delete')" @click="remove" />
        </template>
        <Button v-if="f.patient" icon="pi pi-send" :label="t('cl.sch.remind')" text size="small" @click="share" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!valid" />
      </div>
    </form>
    <PatientDialog v-model:open="adding" :initial-name="q.trim()" @saved="pickPatient" />
  </Dialog>
</template>
