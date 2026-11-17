<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import { prefs } from '@/core/util/prefs'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import PatientDialog from './PatientDialog.vue'
import { db } from '../db'
import { listPatients, startVisit, type PatientRow } from '../db/data'
import { useClinic } from '../store'

/** Find a patient (name, code, phone) or add a new one, then put them in the day's queue (with a doctor and room). */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ date: string; doctorId?: string | null }>()
const emit = defineEmits<{ started: [visitId: string] }>()
const { t } = useI18n()
const cl = useClinic()
const doctorId = ref<string | null>(null)
const roomId = ref<string | null>(null)
const doctorOpts = computed(() => [{ label: t('cl.sch.anyDoctor'), value: null }, ...cl.activeDoctors.map((d) => ({ label: d.name, value: d.id }))])
const roomOpts = computed(() => [{ label: t('cl.sch.noRoom'), value: null }, ...cl.activeRooms.map((r) => ({ label: r.name, value: r.id }))])
function pickDoctor(id: string | null) {
  doctorId.value = id
  roomId.value = cl.doctor(id)?.room_id ?? roomId.value
  prefs.set('clinic.lastDoctor', id ?? '')
}
const q = ref('')
const rows = ref<PatientRow[]>([])
const adding = ref(false)
let timer = 0
watch(q, () => {
  clearTimeout(timer)
  timer = window.setTimeout(search, 150)
})
watch(open, (v) => {
  if (!v) return
  q.value = ''
  const want = props.doctorId ?? prefs.get('clinic.lastDoctor')
  const d = cl.activeDoctors.find((x) => x.id === want) ?? (cl.activeDoctors.length === 1 ? cl.activeDoctors[0] : undefined)
  doctorId.value = d?.id ?? null
  roomId.value = d?.room_id ?? null
  search()
})
async function search() {
  rows.value = await listPatients(db, q.value)
}
async function start(patientId: string) {
  const id = await startVisit(db, patientId, props.date, cl.settings.consult_service || null, { doctor_id: doctorId.value, room_id: roomId.value })
  open.value = false
  emit('started', id)
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="t('cl.newVisit')" class="w-[min(30rem,calc(100vw-1rem))]">
    <div class="flex flex-col gap-3">
      <div v-if="cl.activeDoctors.length || cl.activeRooms.length" class="grid grid-cols-2 gap-2">
        <label v-if="cl.activeDoctors.length" class="field"><span>{{ t('cl.sch.doctor') }}</span><Select :model-value="doctorId" :options="doctorOpts" :placeholder="t('cl.sch.anyDoctor')" option-label="label" option-value="value" @update:model-value="pickDoctor" /></label>
        <label v-if="cl.activeRooms.length" class="field"><span>{{ t('cl.sch.room') }}</span><Select v-model="roomId" :options="roomOpts" :placeholder="t('cl.sch.noRoom')" option-label="label" option-value="value" /></label>
      </div>
      <InputText v-model="q" :placeholder="t('cl.searchPatient')" autofocus />
      <Button :label="q.trim() ? t('cl.addNamed', { name: q.trim() }) : t('cl.newPatient')" icon="pi pi-user-plus" outlined class="self-start" @click="adding = true" />
      <ul class="max-h-80 divide-y divide-[var(--k-border)] overflow-y-auto">
        <li v-for="p in rows" :key="p.id">
          <button type="button" class="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-[var(--k-border)]/40" @click="start(p.id)">
            <span class="w-16 shrink-0 font-mono text-xs text-[var(--k-muted)]">{{ p.code }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold">{{ p.name }}</span>
              <span class="block text-xs text-[var(--k-muted)]">{{ [p.phone, p.last_date ? t('cl.lastVisit', { date: p.last_date }) : ''].filter(Boolean).join(' · ') }}</span>
            </span>
            <i class="pi pi-arrow-right text-[var(--k-muted)]" />
          </button>
        </li>
      </ul>
    </div>
    <PatientDialog v-model:open="adding" :initial-name="q.trim()" @saved="start" />
  </Dialog>
</template>
