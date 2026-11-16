<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import LevelTag from '../components/LevelTag.vue'
import { db } from '../db'
import { clearDue, dueRecords, latestReadings, listAppointments, listMedicines, setAppointmentDone, setTaken, takenOn, type Appointment, type HealthRecord, type Medicine, type Reading } from '../db/data'
import { dosesOn, levelOf, UNITS } from '../rules'
import { useHealth } from '../store'
import { today } from '@/core/util/date'

/** Today: medicines to take (tick), appointments and follow-ups coming up, latest readings. */
const { t } = useI18n()
const hl = useHealth()
const day = ref(new Date())
const dayStr = computed(() => today(day.value))
const meds = ref<Medicine[]>([])
const taken = ref<Set<string>>(new Set())
const appts = ref<Appointment[]>([])
const due = ref<HealthRecord[]>([])
const latest = ref<Reading[]>([])

async function load() {
  const in30 = new Date(day.value)
  in30.setDate(in30.getDate() + 30)
  ;[meds.value, taken.value, appts.value, due.value, latest.value] = await Promise.all([
    listMedicines(db), takenOn(db, dayStr.value), listAppointments(db), dueRecords(db, today(in30)), latestReadings(db),
  ])
}
onMounted(load)
watch([dayStr, () => hl.version], load)

const doses = computed(() => dosesOn(meds.value, dayStr.value))
const doneCount = computed(() => doses.value.filter((d) => taken.value.has(`${d.med.id}@${d.time}`)).length)
async function toggle(medId: string, time: string) {
  const k = `${medId}@${time}`
  await setTaken(db, medId, dayStr.value, time, !taken.value.has(k))
  taken.value = await takenOn(db, dayStr.value)
}
const soon = computed(() => {
  const lim = new Date(day.value)
  lim.setDate(lim.getDate() + 14)
  return appts.value.filter((a) => a.date <= today(lim))
})
async function apptDone(a: Appointment) {
  await setAppointmentDone(db, a.id, true)
  await load()
}
async function dueDone(r: HealthRecord) {
  await clearDue(db, r.id)
  await load()
}
const nowTime = computed(() => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})
const isToday = computed(() => dayStr.value === today())
const latestBy = computed(() => {
  const by = new Map<string, Reading[]>()
  for (const r of latest.value.filter((r) => ['BP', 'GLUCOSE', 'WEIGHT', 'TEMP'].includes(r.kind))) by.set(r.person_id, [...(by.get(r.person_id) ?? []), r])
  return by
})
const show = (r: Reading) => (r.kind === 'BP' ? `${r.v1}/${r.v2}` : String(r.v1))
const ago = (ms: number) => {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  return days <= 0 ? t('hl.todayWord') : t('hl.daysAgo', { n: days })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ isToday ? t('hl.nav.today') : dayStr }}</h1>
      <DatePicker v-model="day" date-format="yy-mm-dd" show-icon class="w-40" :aria-label="t('hl.date')" />
    </div>

    <div v-if="!hl.people.length" class="card flex flex-col items-center gap-3 py-10 text-center">
      <i class="pi pi-users text-4xl text-[var(--k-muted)]" />
      <p class="max-w-md text-[var(--k-muted)]">{{ t('hl.emptyFamily') }}</p>
      <RouterLink to="/family?add=1"><Button :label="t('hl.addPerson')" icon="pi pi-plus" /></RouterLink>
    </div>

    <template v-else>
      <!-- Medicines -->
      <section class="card flex flex-col gap-2">
        <div class="flex items-center">
          <h2 class="flex-1 font-semibold"><i class="pi pi-box mr-1 text-primary-600" />{{ t('hl.medsToday') }}</h2>
          <span v-if="doses.length" class="text-sm text-[var(--k-muted)]">{{ doneCount }} / {{ doses.length }}</span>
        </div>
        <p v-if="!doses.length" class="text-sm text-[var(--k-muted)]">{{ t('hl.noDoses') }}</p>
        <ul v-else class="flex flex-col divide-y divide-[var(--k-border)]">
          <li v-for="d in doses" :key="d.med.id + d.time">
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2 text-left"
              :aria-pressed="taken.has(`${d.med.id}@${d.time}`)"
              @click="toggle(d.med.id, d.time)"
            >
              <i
                class="pi text-xl"
                :class="taken.has(`${d.med.id}@${d.time}`) ? 'pi-check-circle text-primary-600' : isToday && d.time < nowTime ? 'pi-circle text-amber-600' : 'pi-circle text-[var(--k-muted)]'"
              />
              <span class="w-12 font-semibold tabular-nums">{{ d.time }}</span>
              <span class="min-w-0 flex-1" :class="{ 'text-[var(--k-muted)] line-through': taken.has(`${d.med.id}@${d.time}`) }">
                <span class="block truncate">{{ d.med.name }}<span v-if="d.med.dose" class="text-[var(--k-muted)]"> · {{ d.med.dose }}</span></span>
              </span>
              <span class="inline-flex items-center gap-1 text-sm"><span class="size-2.5 rounded-full" :style="{ background: hl.personColor(d.med.person_id) }" />{{ hl.personName(d.med.person_id) }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- Appointments & follow-ups -->
      <section v-if="soon.length || due.length" class="card flex flex-col gap-2">
        <h2 class="font-semibold"><i class="pi pi-calendar mr-1 text-primary-600" />{{ t('hl.comingUp') }}</h2>
        <ul class="flex flex-col divide-y divide-[var(--k-border)]">
          <li v-for="a in soon" :key="a.id" class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block font-semibold" :class="{ 'text-amber-700 dark:text-amber-400': a.date < dayStr }">
                {{ a.date }}<template v-if="a.time"> {{ a.time }}</template> · {{ hl.personName(a.person_id) }}
              </span>
              <span class="block text-xs text-[var(--k-muted)]">{{ [a.reason, a.doctor, a.place].filter(Boolean).join(' · ') || t('hl.appointment') }}</span>
            </span>
            <Button :label="t('hl.done')" size="small" outlined @click="apptDone(a)" />
          </li>
          <li v-for="r in due" :key="r.id" class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block font-semibold" :class="{ 'text-amber-700 dark:text-amber-400': r.next_due! < dayStr }">{{ r.next_due }} · {{ hl.personName(r.person_id) }}</span>
              <span class="block text-xs text-[var(--k-muted)]">{{ t(`hl.rec.${r.kind}`) }}: {{ r.title }}</span>
            </span>
            <Button :label="t('hl.done')" size="small" outlined @click="dueDone(r)" />
          </li>
        </ul>
      </section>

      <!-- Family at a glance -->
      <section class="grid gap-3 sm:grid-cols-2">
        <RouterLink v-for="p in hl.people" :key="p.id" :to="`/p/${p.id}`" class="card flex flex-col gap-2 hover:border-primary-500">
          <div class="flex items-center gap-2">
            <span class="grid size-9 place-items-center rounded-full font-semibold text-white" :style="{ background: p.color || '#059669' }">{{ [...p.name][0] }}</span>
            <span class="min-w-0 flex-1 truncate font-semibold">{{ p.name }}</span>
            <span v-if="p.allergies" class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200"><i class="pi pi-exclamation-triangle mr-1 text-[10px]" />{{ t('hl.allergyShort') }}</span>
          </div>
          <ul v-if="latestBy.get(p.id)?.length" class="flex flex-col gap-1 text-sm">
            <li v-for="r in latestBy.get(p.id)" :key="r.id" class="flex items-center gap-2">
              <span class="w-24 text-[var(--k-muted)]">{{ t(`hl.kind.${r.kind}`) }}</span>
              <b class="tabular-nums">{{ show(r) }}</b><span class="text-xs text-[var(--k-muted)]">{{ UNITS[r.kind] }}</span>
              <LevelTag :level="levelOf(r.kind, r.v1, r.v2, r.context)" />
              <span class="ml-auto text-xs text-[var(--k-muted)]">{{ ago(r.taken_at) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-[var(--k-muted)]">{{ t('hl.noReadingsYet') }}</p>
        </RouterLink>
      </section>
    </template>
  </div>
</template>
