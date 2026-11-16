<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import PhotoField from '@/components/PhotoField.vue'
import { db } from '../db'
import { savePerson, type Person } from '../db/data'
import { PERSON_COLORS, useHealth } from '../store'
import { today } from '@/core/util/date'

/** Add or edit a family member. */
const props = defineProps<{ person?: Person | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useI18n()
const hl = useHealth()
const f = reactive({ name: '', relation: '', birth: null as Date | null, sex: null as 'M' | 'F' | null, blood_type: '', allergies: '', conditions: '', note: '', photo: null as string | null, color: PERSON_COLORS[0] })
watch(open, (v) => {
  if (!v) return
  const p = props.person
  Object.assign(f, {
    name: p?.name ?? '', relation: p?.relation ?? '', birth: p?.birth_date ? new Date(p.birth_date + 'T00:00:00') : null, sex: p?.sex ?? null,
    blood_type: p?.blood_type ?? '', allergies: p?.allergies ?? '', conditions: p?.conditions ?? '', note: p?.note ?? '', photo: p?.photo ?? null,
    color: p?.color ?? PERSON_COLORS[hl.people.length % PERSON_COLORS.length],
  })
})
const sexOpts = [
  { label: t('hl.sexM'), value: 'M' },
  { label: t('hl.sexF'), value: 'F' },
]
async function save() {
  if (!f.name.trim()) return
  const id = await savePerson(db, {
    id: props.person?.id, name: f.name, relation: f.relation, birth_date: f.birth ? today(f.birth) : null, sex: f.sex, blood_type: f.blood_type,
    allergies: f.allergies, conditions: f.conditions, note: f.note, photo: f.photo, color: f.color, active: props.person?.active ?? 1,
  })
  await hl.load()
  open.value = false
  emit('saved', id)
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="person ? t('hl.editPerson') : t('hl.addPerson')" class="w-[min(30rem,calc(100vw-1rem))]">
    <div class="flex flex-col gap-3">
      <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="f.name" autofocus /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="field"><span>{{ t('hl.relation') }}</span><InputText v-model="f.relation" :placeholder="t('hl.relationPh')" /></label>
        <label class="field"><span>{{ t('hl.birth') }}</span><DatePicker v-model="f.birth" date-format="yy-mm-dd" show-icon :max-date="new Date()" /></label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="field"><span>{{ t('hl.sex') }}</span><SelectButton v-model="f.sex" :options="sexOpts" option-label="label" option-value="value" /></div>
        <label class="field"><span>{{ t('hl.bloodType') }}</span><InputText v-model="f.blood_type" placeholder="O+" /></label>
      </div>
      <label class="field"><span>{{ t('hl.allergies') }}</span><InputText v-model="f.allergies" :placeholder="t('hl.allergiesPh')" /></label>
      <label class="field"><span>{{ t('hl.conditions') }}</span><InputText v-model="f.conditions" :placeholder="t('hl.conditionsPh')" /></label>
      <label class="field"><span>{{ t('hl.note') }}</span><Textarea v-model="f.note" rows="2" auto-resize /></label>
      <div class="field">
        <span>{{ t('hl.color') }}</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in PERSON_COLORS"
            :key="c"
            type="button"
            class="size-8 rounded-full ring-offset-2 ring-offset-[var(--k-surface)]"
            :class="{ 'ring-2 ring-[var(--k-text)]': f.color === c }"
            :style="{ background: c }"
            :aria-label="c"
            :aria-pressed="f.color === c"
            @click="f.color = c"
          />
        </div>
      </div>
      <div class="field"><span>{{ t('hl.photo') }}</span><PhotoField v-model="f.photo" tool="health" /></div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="open = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" @click="save" />
    </template>
  </Dialog>
</template>
