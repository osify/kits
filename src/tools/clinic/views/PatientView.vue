<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import PatientDialog from '../components/PatientDialog.vue'
import ApptDialog from '../components/ApptDialog.vue'
import { db } from '../db'
import { deletePatient, getPatient, listVisitsOf, startVisit, upcomingOf, type ApptRow, type Patient, type VisitRow } from '../db/data'
import { useClinic } from '../store'
import { age } from '../../health/rules'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** A patient's details and visit history. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const cl = useClinic()
const id = route.params.id as string
const p = ref<Patient | null>(null)
const visits = ref<VisitRow[]>([])
const editing = ref(false)
const appts = ref<ApptRow[]>([])
const booking = ref(false)
const apptEdit = ref<ApptRow | null>(null)
function book(a: ApptRow | null = null) {
  apptEdit.value = a
  booking.value = true
}
async function load() {
  p.value = (await getPatient(db, id)) ?? null
  if (!p.value) return void router.replace('/patients')
  ;[visits.value, appts.value] = await Promise.all([listVisitsOf(db, id), upcomingOf(db, id, today())])
}
onMounted(load)
const m = (v: number) => formatMoney(v, cl.currency)
const ageText = computed(() => {
  const a = age(p.value?.birth_date, today())
  return a ? (a.years >= 2 ? t('hl.years', { n: a.years }) : t('hl.months', { n: a.months })) : ''
})
const owing = computed(() => visits.value.reduce((s, v) => s + Math.max(0, v.total - v.paid), 0))
async function newVisit() {
  const v = await startVisit(db, id, today(), cl.settings.consult_service || null)
  router.push(`/v/${v}`)
}
function remove() {
  confirm.require({
    message: t('cl.deletePatientConfirm', { name: p.value!.name }),
    acceptProps: { label: t('hl.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deletePatient(db, id)
      router.replace('/patients')
    },
  })
}
</script>

<template>
  <div v-if="p" class="flex flex-col gap-4">
    <div class="flex items-start gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.back()" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ p.name }}</h1>
        <p class="text-sm text-[var(--k-muted)]">
          <span class="font-mono">{{ p.code }}</span> · {{ [p.sex ? t(`hl.sex${p.sex}`) : '', ageText, p.phone].filter(Boolean).join(' · ') }}
        </p>
      </div>
      <Button icon="pi pi-pencil" text rounded :aria-label="t('cl.editPatient')" @click="editing = true" />
    </div>
    <p v-if="p.allergies" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
      <i class="pi pi-exclamation-triangle mr-1" /><b>{{ t('hl.allergies') }}:</b> {{ p.allergies }}
    </p>
    <p v-if="p.conditions" class="text-sm"><b>{{ t('hl.conditions') }}:</b> {{ p.conditions }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <Button :label="t('cl.newVisitToday')" icon="pi pi-plus" @click="newVisit" />
      <Button :label="t('cl.sch.book')" icon="pi pi-calendar-plus" outlined @click="book()" />
      <Tag v-if="owing" severity="warn" :value="t('cl.owes', { amount: m(owing) })" />
    </div>

    <section v-if="appts.length" class="card flex flex-col !py-1">
      <h2 class="py-2 font-semibold"><i class="pi pi-calendar mr-1 text-primary-600" />{{ t('cl.sch.upcoming') }}</h2>
      <button v-for="a in appts" :key="a.id" type="button" class="flex items-center gap-3 border-t border-[var(--k-border)] py-2 text-left" @click="book(a)">
        <span class="h-8 w-1 shrink-0 rounded-full" :style="{ background: cl.doctor(a.doctor_id)?.color ?? '#64748b' }" />
        <span class="min-w-0 flex-1">
          <span class="block font-semibold tabular-nums">{{ a.date }} · {{ a.start }}</span>
          <span class="block truncate text-sm text-[var(--k-muted)]">{{ [cl.doctor(a.doctor_id)?.name, cl.room(a.room_id)?.name, a.reason].filter(Boolean).join(' · ') || '—' }}</span>
        </span>
        <Tag :severity="a.status === 'ARRIVED' ? 'warn' : 'info'" :value="t(`cl.sch.status.${a.status}`)" />
      </button>
    </section>

    <section class="card flex flex-col !py-1">
      <h2 class="py-2 font-semibold">{{ t('cl.history') }}</h2>
      <p v-if="!visits.length" class="pb-3 text-sm text-[var(--k-muted)]">{{ t('cl.noVisits') }}</p>
      <RouterLink v-for="v in visits" :key="v.id" :to="`/v/${v.id}`" class="flex items-center gap-3 border-t border-[var(--k-border)] py-2">
        <span class="min-w-0 flex-1">
          <span class="block font-semibold">{{ v.date }} <Tag v-if="v.status === 'WAITING'" severity="warn" :value="t('cl.waiting')" class="ml-1" /></span>
          <span class="block truncate text-sm text-[var(--k-muted)]">{{ v.diagnosis || v.complaint || '—' }}</span>
        </span>
        <span class="text-right text-sm tabular-nums">
          {{ m(v.total) }}
          <span v-if="v.paid < v.total" class="block text-xs font-semibold text-amber-700 dark:text-amber-400">{{ t('cl.owes', { amount: m(v.total - v.paid) }) }}</span>
        </span>
      </RouterLink>
    </section>

    <div class="border-t border-[var(--k-border)] pt-4">
      <Button :label="t('cl.deletePatient')" icon="pi pi-trash" text severity="danger" size="small" @click="remove" />
    </div>
    <PatientDialog v-model:open="editing" :patient="p" @saved="load" />
    <ApptDialog v-model:open="booking" :appt="apptEdit" :preset="{ patient_id: p.id }" @changed="load" @checked-in="(vid) => router.push(`/v/${vid}`)" />
  </div>
</template>
