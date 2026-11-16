<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import { db } from '../db'
import { savePatient, type Patient } from '../db/data'
import { today } from '@/core/util/date'

/** Add or edit a patient. */
const props = defineProps<{ patient?: Patient | null; initialName?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useI18n()
const f = reactive({ name: '', sex: null as 'M' | 'F' | null, birth: null as Date | null, phone: '', address: '', allergies: '', conditions: '', note: '' })
watch(open, (v) => {
  if (!v) return
  const p = props.patient
  Object.assign(f, {
    name: p?.name ?? props.initialName ?? '', sex: p?.sex ?? null, birth: p?.birth_date ? new Date(p.birth_date + 'T00:00:00') : null, phone: p?.phone ?? '',
    address: p?.address ?? '', allergies: p?.allergies ?? '', conditions: p?.conditions ?? '', note: p?.note ?? '',
  })
})
const sexOpts = [
  { label: t('hl.sexM'), value: 'M' },
  { label: t('hl.sexF'), value: 'F' },
]
async function save() {
  if (!f.name.trim()) return
  const id = await savePatient(db, {
    id: props.patient?.id, name: f.name, sex: f.sex, birth_date: f.birth ? today(f.birth) : null, phone: f.phone, address: f.address,
    allergies: f.allergies, conditions: f.conditions, note: f.note,
  })
  open.value = false
  emit('saved', id)
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="patient ? `${patient.code} · ${t('cl.editPatient')}` : t('cl.newPatient')" class="w-[min(30rem,calc(100vw-1rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="f.name" autofocus /></label>
      <div class="grid grid-cols-2 gap-3">
        <div class="field"><span>{{ t('hl.sex') }}</span><SelectButton v-model="f.sex" :options="sexOpts" option-label="label" option-value="value" /></div>
        <label class="field"><span>{{ t('hl.birth') }}</span><DatePicker v-model="f.birth" date-format="yy-mm-dd" show-icon :max-date="new Date()" /></label>
      </div>
      <label class="field"><span>{{ t('cl.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
      <label class="field"><span>{{ t('cl.address') }}</span><InputText v-model="f.address" /></label>
      <label class="field"><span>{{ t('hl.allergies') }}</span><InputText v-model="f.allergies" :placeholder="t('hl.allergiesPh')" /></label>
      <label class="field"><span>{{ t('hl.conditions') }}</span><InputText v-model="f.conditions" /></label>
      <label class="field"><span>{{ t('hl.note') }}</span><Textarea v-model="f.note" rows="2" auto-resize /></label>
      <div class="flex justify-end gap-2">
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" />
      </div>
    </form>
  </Dialog>
</template>
