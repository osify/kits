<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Checkbox from 'primevue/checkbox'
import { db } from '../db'
import { deleteAppointment, listAppointments, saveAppointment, setAppointmentDone, type Appointment } from '../db/data'
import { today } from '@/core/util/date'

/** Doctor appointments and follow-ups for one person. */
const props = defineProps<{ personId: string }>()
const { t } = useI18n()
const rows = ref<Appointment[]>([])
const load = async () => (rows.value = await listAppointments(db, props.personId))
onMounted(load)
const todayStr = today()

const open = ref(false)
const f = reactive({ id: undefined as string | undefined, date: new Date(), time: '', place: '', doctor: '', reason: '', note: '' })
function edit(a?: Appointment) {
  Object.assign(f, { id: a?.id, date: a ? new Date(a.date + 'T00:00:00') : new Date(), time: a?.time ?? '', place: a?.place ?? '', doctor: a?.doctor ?? '', reason: a?.reason ?? '', note: a?.note ?? '' })
  open.value = true
}
async function save() {
  await saveAppointment(db, { id: f.id, person_id: props.personId, date: today(f.date), time: f.time, place: f.place, doctor: f.doctor, reason: f.reason, note: f.note })
  open.value = false
  await load()
}
async function done(a: Appointment, v: boolean) {
  await setAppointmentDone(db, a.id, v)
  await load()
}
async function remove() {
  await deleteAppointment(db, f.id!)
  open.value = false
  await load()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Button :label="t('hl.addAppointment')" icon="pi pi-plus" class="self-start" @click="edit()" />
    <p v-if="!rows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('hl.noAppointments') }}</p>
    <ul v-else class="card flex flex-col divide-y divide-[var(--k-border)] !py-1">
      <li v-for="a in rows" :key="a.id" class="flex items-center gap-3 py-2" :class="{ 'opacity-60': a.done_at }">
        <Checkbox :model-value="!!a.done_at" binary :aria-label="t('hl.markDone')" @update:model-value="(v: boolean) => done(a, v)" />
        <button type="button" class="min-w-0 flex-1 text-left" @click="edit(a)">
          <span class="block font-semibold" :class="{ 'line-through': a.done_at, 'text-amber-700 dark:text-amber-400': !a.done_at && a.date < todayStr }">
            {{ a.date }}<template v-if="a.time"> {{ a.time }}</template> · {{ a.reason || t('hl.appointment') }}
          </span>
          <span class="block text-xs text-[var(--k-muted)]">{{ [a.doctor, a.place, a.note].filter(Boolean).join(' · ') }}</span>
        </button>
      </li>
    </ul>

    <Dialog v-model:visible="open" modal :header="f.id ? t('hl.editAppointment') : t('hl.addAppointment')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="field"><span>{{ t('hl.date') }}</span><DatePicker v-model="f.date" date-format="yy-mm-dd" show-icon /></label>
          <label class="field"><span>{{ t('hl.time') }}</span><input v-model="f.time" type="time" class="rounded-lg border border-[var(--k-border)] bg-transparent px-3 py-2" /></label>
        </div>
        <label class="field"><span>{{ t('hl.reason') }}</span><InputText v-model="f.reason" :placeholder="t('hl.reasonPh')" /></label>
        <label class="field"><span>{{ t('hl.doctor') }}</span><InputText v-model="f.doctor" /></label>
        <label class="field"><span>{{ t('hl.place') }}</span><InputText v-model="f.place" /></label>
        <label class="field"><span>{{ t('hl.note') }}</span><InputText v-model="f.note" /></label>
      </div>
      <template #footer>
        <Button v-if="f.id" :label="t('hl.delete')" text severity="danger" @click="remove" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
