<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Tag from 'primevue/tag'
import StartVisit from '../components/StartVisit.vue'
import ApptDialog, { type ApptPreset } from '../components/ApptDialog.vue'
import { db } from '../db'
import { checkIn, followupsDue, listAppointments, listVisitsOn, type ApptRow, type VisitRow } from '../db/data'
import { prefs } from '@/core/util/prefs'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** The day's queue (waiting / done, per doctor), bookings still to arrive, money of the day, follow-ups due. */
const { t } = useI18n()
const router = useRouter()
const cl = useClinic()
const day = ref(new Date())
const dayStr = computed(() => today(day.value))
const rows = ref<VisitRow[]>([])
const due = ref<VisitRow[]>([])
const booked = ref<ApptRow[]>([])
const starting = ref(false)
async function load() {
  let appts: ApptRow[]
  ;[rows.value, due.value, appts] = await Promise.all([listVisitsOn(db, dayStr.value), followupsDue(db, dayStr.value), listAppointments(db, dayStr.value, dayStr.value)])
  booked.value = appts.filter((a) => a.status === 'BOOKED')
}
// Queue per doctor (only when the clinic has several doctors). 'all' = everyone.
const docFilter = ref(prefs.get('clinic.queueDoctor') || 'all')
watch(docFilter, (v) => prefs.set('clinic.queueDoctor', v))
const docChips = computed(() => (cl.activeDoctors.length > 1 ? cl.activeDoctors : []))
const mine = <T extends { doctor_id: string | null }>(list: T[]) =>
  docFilter.value === 'all' || !docChips.value.some((d) => d.id === docFilter.value) ? list : list.filter((r) => r.doctor_id === docFilter.value || !r.doctor_id)
const who = (id: string | null) => cl.doctor(id)
async function arrive(a: ApptRow) {
  const vid = await checkIn(db, a.id, cl.settings.consult_service || null)
  if (vid) router.push(`/v/${vid}`)
}
const apptOpen = ref(false)
const apptEdit = ref<ApptRow | null>(null)
const preset = ref<ApptPreset | null>(null)
function openAppt(a: ApptRow) {
  apptEdit.value = a
  preset.value = null
  apptOpen.value = true
}
function bookFollowup(v: VisitRow) {
  apptEdit.value = null
  preset.value = { patient_id: v.patient_id, doctor_id: v.doctor_id, date: v.followup_date! < today() ? today() : v.followup_date!, reason: t('cl.followup') }
  apptOpen.value = true
}
onMounted(load)
watch([dayStr, () => cl.version], load)
const m = (v: number) => formatMoney(v, cl.currency)
const waiting = computed(() => mine(rows.value).filter((r) => r.status === 'WAITING'))
const done = computed(() => mine(rows.value).filter((r) => r.status === 'DONE'))
const bookedShown = computed(() => mine(booked.value))
const totals = computed(() => ({
  billed: rows.value.reduce((s, r) => s + r.total, 0),
  received: rows.value.reduce((s, r) => s + r.paid, 0),
}))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ dayStr === today() ? t('cl.nav.today') : dayStr }}</h1>
      <DatePicker v-model="day" date-format="yy-mm-dd" show-icon class="w-40" :aria-label="t('hl.date')" />
      <Button :label="t('cl.newVisit')" icon="pi pi-plus" @click="starting = true" />
    </div>

    <div class="grid grid-cols-3 gap-3">
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('cl.patientsToday') }}</div><div class="text-lg font-semibold">{{ rows.length }}</div></div>
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('cl.billed') }}</div><div class="text-lg font-semibold tabular-nums">{{ m(totals.billed) }}</div></div>
      <div class="card">
        <div class="text-xs text-[var(--k-muted)]">{{ t('cl.received') }}</div>
        <div class="text-lg font-semibold tabular-nums">{{ m(totals.received) }}</div>
      </div>
    </div>

    <div v-if="docChips.length" class="flex flex-wrap gap-1.5">
      <button type="button" class="rounded-full border px-3 py-1 text-sm" :class="docFilter === 'all' ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--k-border)]'" @click="docFilter = 'all'">
        {{ t('cl.sch.allDoctors') }}
      </button>
      <button
        v-for="d in docChips"
        :key="d.id"
        type="button"
        class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
        :class="docFilter === d.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--k-border)]'"
        @click="docFilter = d.id"
      >
        <span class="size-2 rounded-full" :style="{ background: d.color }" />{{ d.name }}
      </button>
    </div>

    <section v-if="bookedShown.length" class="card flex flex-col gap-1">
      <h2 class="font-semibold"><i class="pi pi-calendar-clock mr-1 text-primary-600" />{{ t('cl.sch.comingToday') }} ({{ bookedShown.length }})</h2>
      <div v-for="a in bookedShown" :key="a.id" class="flex items-center gap-3 px-1 py-1.5">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openAppt(a)">
          <span class="w-12 shrink-0 text-center font-semibold tabular-nums">{{ a.start }}</span>
          <span class="h-8 w-1 shrink-0 rounded-full" :style="{ background: who(a.doctor_id)?.color ?? '#64748b' }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ a.name }}</span>
            <span class="block truncate text-xs text-[var(--k-muted)]">{{ [a.code, who(a.doctor_id)?.name, cl.room(a.room_id)?.name, a.reason].filter(Boolean).join(' · ') }}</span>
          </span>
        </button>
        <Button :label="t('cl.sch.checkIn')" icon="pi pi-sign-in" size="small" outlined @click="arrive(a)" />
      </div>
    </section>

    <section class="card flex flex-col gap-1">
      <h2 class="font-semibold"><i class="pi pi-clock mr-1 text-amber-600" />{{ t('cl.waiting') }} ({{ waiting.length }})</h2>
      <p v-if="!waiting.length" class="py-2 text-sm text-[var(--k-muted)]">{{ t('cl.noneWaiting') }}</p>
      <button
        v-for="v in waiting"
        :key="v.id"
        type="button"
        class="flex items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--k-border)]/40"
        @click="router.push(`/v/${v.id}`)"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-lg font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{{ v.queue_no }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ v.name }}</span>
          <span class="block truncate text-xs text-[var(--k-muted)]">{{ [v.code, who(v.doctor_id)?.name, cl.room(v.room_id)?.name, v.complaint].filter(Boolean).join(' · ') }}</span>
        </span>
        <i class="pi pi-chevron-right text-[var(--k-muted)]" />
      </button>
    </section>

    <section v-if="done.length" class="card flex flex-col gap-1">
      <h2 class="font-semibold"><i class="pi pi-check-circle mr-1 text-primary-600" />{{ t('cl.seen') }} ({{ done.length }})</h2>
      <button
        v-for="v in done"
        :key="v.id"
        type="button"
        class="flex items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--k-border)]/40"
        @click="router.push(`/v/${v.id}`)"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--k-border)]/60 font-semibold">{{ v.queue_no }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ v.name }}</span>
          <span class="block truncate text-xs text-[var(--k-muted)]">{{ [v.code, who(v.doctor_id)?.name].filter(Boolean).join(' · ') }}</span>
        </span>
        <span class="text-right">
          <span class="block font-semibold tabular-nums">{{ m(v.total) }}</span>
          <Tag v-if="v.paid < v.total" severity="warn" :value="t('cl.owes', { amount: m(v.total - v.paid) })" />
        </span>
      </button>
    </section>

    <section v-if="due.length" class="card flex flex-col gap-1">
      <h2 class="font-semibold"><i class="pi pi-calendar mr-1 text-primary-600" />{{ t('cl.followupsDue') }}</h2>
      <div v-for="v in due" :key="v.id" class="flex items-center gap-3 px-1 py-1.5">
        <RouterLink :to="`/p/${v.patient_id}`" class="min-w-0 flex-1 hover:underline">
          <span class="block truncate font-semibold">{{ v.name }}</span>
          <span class="block text-xs text-[var(--k-muted)]">{{ v.code }} · {{ t('cl.followupOn', { date: v.followup_date }) }}</span>
        </RouterLink>
        <Button :label="t('cl.sch.book')" icon="pi pi-calendar-plus" size="small" text @click="bookFollowup(v)" />
      </div>
    </section>

    <ApptDialog v-model:open="apptOpen" :appt="apptEdit" :preset="preset" @changed="load" @checked-in="(id) => router.push(`/v/${id}`)" />
    <StartVisit v-model:open="starting" :date="dayStr" :doctor-id="docFilter === 'all' ? null : docFilter" @started="(id) => router.push(`/v/${id}`)" />
  </div>
</template>
