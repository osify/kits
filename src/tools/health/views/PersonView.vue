<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import PersonDialog from '../components/PersonDialog.vue'
import ReadingsTab from '../components/ReadingsTab.vue'
import MedicinesTab from '../components/MedicinesTab.vue'
import AppointmentsTab from '../components/AppointmentsTab.vue'
import RecordsTab from '../components/RecordsTab.vue'
import { db } from '../db'
import { deletePerson, getPerson, latestReadings, type Person } from '../db/data'
import { age, bmi, bmiLevel } from '../rules'
import LevelTag from '../components/LevelTag.vue'
import { useHealth } from '../store'
import { prefs } from '@/core/util/prefs'
import { today } from '@/core/util/date'

/** One family member: profile, readings, medicines, appointments, records. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const hl = useHealth()
const id = route.params.id as string
const p = ref<Person | null>(null)
const bmiVal = ref<number | null>(null)
const editing = ref(false)
type Tab = 'readings' | 'meds' | 'appts' | 'records'
const tab = ref<Tab>((prefs.get('health.tab') as Tab) || 'readings')
watch(tab, (v) => prefs.set('health.tab', v))

async function load() {
  p.value = (await getPerson(db, id)) ?? null
  if (!p.value) return void router.replace('/family')
  const latest = (await latestReadings(db)).filter((r) => r.person_id === id)
  bmiVal.value = bmi(latest.find((r) => r.kind === 'WEIGHT')?.v1, latest.find((r) => r.kind === 'HEIGHT')?.v1)
}
onMounted(load)
watch(() => hl.version, load)

const ageText = computed(() => {
  const a = age(p.value?.birth_date, today())
  if (!a) return ''
  return a.years >= 2 ? t('hl.years', { n: a.years }) : t('hl.months', { n: a.months })
})
const tabs = computed(() => [
  { label: t('hl.tab.readings'), value: 'readings' },
  { label: t('hl.tab.meds'), value: 'meds' },
  { label: t('hl.tab.appts'), value: 'appts' },
  { label: t('hl.tab.records'), value: 'records' },
])
function remove() {
  confirm.require({
    message: t('hl.deletePersonConfirm', { name: p.value!.name }),
    acceptProps: { label: t('hl.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deletePerson(db, id)
      await hl.load()
      router.replace('/family')
    },
  })
}
</script>

<template>
  <div v-if="p" class="flex flex-col gap-4">
    <div class="flex items-start gap-3">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.back()" />
      <span class="grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white" :style="{ background: p.color || '#059669' }">{{ [...p.name][0] }}</span>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ p.name }}</h1>
        <p class="text-sm text-[var(--k-muted)]">{{ [p.relation, ageText, p.sex ? t(`hl.sex${p.sex}`) : '', p.blood_type].filter(Boolean).join(' · ') }}</p>
      </div>
      <Button icon="pi pi-pencil" text rounded :aria-label="t('hl.editPerson')" @click="editing = true" />
    </div>

    <div v-if="p.allergies || p.conditions || bmiVal" class="flex flex-col gap-1 text-sm">
      <p v-if="p.allergies" class="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/50 dark:text-red-200">
        <i class="pi pi-exclamation-triangle mr-1" /><b>{{ t('hl.allergies') }}:</b> {{ p.allergies }}
      </p>
      <p v-if="p.conditions" class="px-1"><b>{{ t('hl.conditions') }}:</b> {{ p.conditions }}</p>
      <p v-if="bmiVal" class="flex items-center gap-2 px-1"><b>BMI</b> {{ bmiVal }} <LevelTag :level="bmiLevel(bmiVal)" /></p>
    </div>

    <SelectButton v-model="tab" :options="tabs" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap self-start" />
    <ReadingsTab v-if="tab === 'readings'" :person-id="id" />
    <MedicinesTab v-else-if="tab === 'meds'" :person-id="id" />
    <AppointmentsTab v-else-if="tab === 'appts'" :person-id="id" />
    <RecordsTab v-else :person-id="id" />

    <div class="mt-4 border-t border-[var(--k-border)] pt-4">
      <Button :label="t('hl.deletePerson')" icon="pi pi-trash" text severity="danger" size="small" @click="remove" />
    </div>
    <PersonDialog v-model:open="editing" :person="p" @saved="load" />
  </div>
</template>
