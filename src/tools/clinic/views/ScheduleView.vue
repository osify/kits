<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import TimeGrid, { type GridColumn, type GridItem } from '../components/TimeGrid.vue'
import ApptDialog, { type ApptPreset } from '../components/ApptDialog.vue'
import { db } from '../db'
import { checkIn, listAppointments, type ApptRow } from '../db/data'
import { addDays, dayWindow, hoursOn, noHours, parseHours, weekStart, type Hours } from '../schedule'
import { useClinic } from '../store'
import { prefs } from '@/core/util/prefs'
import { today } from '@/core/util/date'

/**
 * Appointments calendar. Day by doctor (one column each), day by room, a doctor's week, or a
 * plain list. Tap an empty time to book there; tap a booking to change it or check the patient in.
 */
type Mode = 'doctors' | 'rooms' | 'week' | 'list'
const { t, locale } = useI18n()
const router = useRouter()
const cl = useClinic()
const NONE = '_'
const GREY = '#64748b'

const mode = ref<Mode>((prefs.get('clinic.schMode') as Mode) || 'doctors')
watch(mode, (m) => prefs.set('clinic.schMode', m))
const weekDoctor = ref<string>(prefs.get('clinic.schDoctor') || cl.activeDoctors[0]?.id || NONE)
watch(weekDoctor, (d) => prefs.set('clinic.schDoctor', d))
const day = ref(new Date())
const dayStr = computed(() => today(day.value))
const range = computed(() => (mode.value === 'week' ? { from: weekStart(dayStr.value), to: addDays(weekStart(dayStr.value), 6) } : { from: dayStr.value, to: dayStr.value }))
const rows = ref<ApptRow[]>([])
async function load() {
  rows.value = await listAppointments(db, range.value.from, range.value.to)
}
onMounted(load)
watch([range, () => cl.version], load)

const nowMin = ref(0)
const tick = () => {
  const d = new Date()
  nowMin.value = d.getHours() * 60 + d.getMinutes()
}
tick()
const timer = window.setInterval(tick, 60_000)
onUnmounted(() => clearInterval(timer))

function move(n: number) {
  const d = new Date(day.value)
  d.setDate(d.getDate() + n * (mode.value === 'week' ? 7 : 1))
  day.value = d
}
const modeOpts = computed(() => [
  { label: t('cl.sch.byDoctor'), value: 'doctors', icon: 'pi pi-user' },
  { label: t('cl.sch.byRoom'), value: 'rooms', icon: 'pi pi-building' },
  { label: t('cl.sch.week'), value: 'week', icon: 'pi pi-calendar' },
  { label: t('cl.sch.list'), value: 'list', icon: 'pi pi-list' },
])
const weekDoctorOpts = computed(() => [{ label: t('cl.sch.allDoctors'), value: NONE }, ...cl.activeDoctors.map((d) => ({ label: d.name, value: d.id }))])

const hoursOf = (id: string | null) => parseHours(cl.doctor(id)?.hours)
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00').toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', opts)

const shown = computed(() => rows.value.filter((a) => a.status !== 'CANCELLED'))
const columns = computed<GridColumn[]>(() => {
  const isToday = (d: string) => d === today()
  if (mode.value === 'week') {
    const h: Hours | null = weekDoctor.value === NONE ? null : hoursOf(weekDoctor.value)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(range.value.from, i)
      return { key: d, label: fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' }), work: h && !noHours(h) ? hoursOn(h, d) : null, today: isToday(d) }
    })
  }
  if (mode.value === 'rooms') {
    const used = new Set(shown.value.map((a) => a.room_id ?? NONE))
    const cols: GridColumn[] = cl.rooms.filter((r) => r.active || used.has(r.id)).map((r) => ({ key: r.id, label: r.name }))
    if (!cols.length || used.has(NONE)) cols.push({ key: NONE, label: t('cl.sch.noRoom') })
    return cols
  }
  const used = new Set(shown.value.map((a) => a.doctor_id ?? NONE))
  const cols: GridColumn[] = cl.doctors
    .filter((d) => d.active || used.has(d.id))
    .map((d) => {
      const h = parseHours(d.hours)
      const work = noHours(h) ? null : hoursOn(h, dayStr.value)
      return { key: d.id, label: d.name, sub: [d.title, cl.room(d.room_id)?.name, work && !work.length ? t('cl.sch.dayOff') : ''].filter(Boolean).join(' · '), color: d.color, work }
    })
  if (!cols.length || used.has(NONE)) cols.push({ key: NONE, label: t('cl.sch.anyDoctor'), color: GREY })
  return cols
})
const state = (a: ApptRow): GridItem['state'] => (a.status === 'NO_SHOW' ? 'missed' : a.status === 'ARRIVED' ? (a.visit_status === 'DONE' ? 'done' : 'waiting') : 'booked')
const items = computed<GridItem[]>(() => {
  let list = shown.value
  if (mode.value === 'week' && weekDoctor.value !== NONE) list = list.filter((a) => a.doctor_id === weekDoctor.value)
  return list.map((a) => {
    const d = cl.doctor(a.doctor_id)
    const col = mode.value === 'week' ? a.date : mode.value === 'rooms' ? (a.room_id ?? NONE) : (a.doctor_id ?? NONE)
    const where = mode.value === 'rooms' ? d?.name : cl.room(a.room_id)?.name
    return { id: a.id, col, start: a.start, minutes: a.minutes, title: a.name, sub: [where, a.reason].filter(Boolean).join(' · '), color: d?.color ?? GREY, state: state(a) }
  })
})
const win = computed(() => {
  const docs = mode.value === 'week' ? (weekDoctor.value === NONE ? cl.activeDoctors : cl.activeDoctors.filter((d) => d.id === weekDoctor.value)) : cl.activeDoctors
  const dates = mode.value === 'week' ? columns.value.map((c) => c.key) : [dayStr.value]
  return dayWindow(docs.map((d) => parseHours(d.hours)), dates, items.value)
})
const step = computed(() => {
  const d = mode.value === 'week' && weekDoctor.value !== NONE ? cl.doctor(weekDoctor.value) : cl.activeDoctors.length === 1 ? cl.activeDoctors[0] : undefined
  return d?.slot_min && d.slot_min <= 30 ? d.slot_min : 15
})

const showNow = computed(() => (mode.value === 'week' ? columns.value.some((c) => c.today) : dayStr.value === today()))

// Per-doctor counts for the day
const counts = computed(() => {
  const m = new Map<string, number>()
  for (const a of rows.value) if (a.status === 'BOOKED' || a.status === 'ARRIVED') m.set(a.doctor_id ?? NONE, (m.get(a.doctor_id ?? NONE) ?? 0) + 1)
  return [...m.entries()].map(([id, n]) => ({ id, n, name: cl.doctor(id === NONE ? null : id)?.name ?? t('cl.sch.anyDoctor'), color: cl.doctor(id === NONE ? null : id)?.color ?? GREY }))
})

// ── Booking dialog ──────────────────────────────────────────────────────────
const dlg = ref(false)
const editing = ref<ApptRow | null>(null)
const preset = ref<ApptPreset | null>(null)
function book(p: ApptPreset = {}) {
  editing.value = null
  preset.value = { date: dayStr.value, ...p }
  dlg.value = true
}
function onPick(col: string, start: string) {
  const id = col === NONE ? null : col
  if (mode.value === 'week') book({ date: col, start, doctor_id: weekDoctor.value === NONE ? null : weekDoctor.value })
  else if (mode.value === 'rooms') book({ start, room_id: id })
  else book({ start, doctor_id: id, room_id: cl.doctor(id)?.room_id ?? null })
}
function openAppt(id: string) {
  editing.value = rows.value.find((a) => a.id === id) ?? null
  preset.value = null
  dlg.value = !!editing.value
}
async function arrive(a: ApptRow) {
  const vid = await checkIn(db, a.id, cl.settings.consult_service || null)
  if (vid) router.push(`/v/${vid}`)
}
const title = computed(() =>
  mode.value === 'week'
    ? `${fmtDay(range.value.from, { day: 'numeric', month: 'short' })} – ${fmtDay(range.value.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : fmtDay(dayStr.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
)
const statusSev = (a: ApptRow) => (a.status === 'BOOKED' ? 'info' : a.status === 'ARRIVED' ? (a.visit_status === 'DONE' ? 'success' : 'warn') : 'secondary')
const statusLabel = (a: ApptRow) => (a.status === 'ARRIVED' && a.visit_status === 'DONE' ? t('cl.seenOne') : t(`cl.sch.status.${a.status}`))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('cl.nav.schedule') }}</h1>
      <Button icon="pi pi-cog" text rounded :aria-label="t('cl.sch.setup')" v-tooltip.bottom="t('cl.sch.setup')" @click="router.push('/schedule/setup')" />
      <Button :label="t('cl.sch.book')" icon="pi pi-plus" @click="book()" />
    </div>

    <div v-if="!cl.activeDoctors.length" class="card flex flex-wrap items-center gap-3 text-sm">
      <i class="pi pi-info-circle text-primary-600" />
      <span class="min-w-0 flex-1">{{ t('cl.sch.setupHint') }}</span>
      <Button :label="t('cl.sch.setup')" icon="pi pi-users" size="small" outlined @click="router.push('/schedule/setup')" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center">
        <Button icon="pi pi-chevron-left" text rounded :aria-label="t('cl.sch.prev')" @click="move(-1)" />
        <Button :label="t('cl.sch.today')" size="small" outlined @click="day = new Date()" />
        <Button icon="pi pi-chevron-right" text rounded :aria-label="t('cl.sch.next')" @click="move(1)" />
      </div>
      <DatePicker v-model="day" date-format="yy-mm-dd" show-icon class="w-40" :aria-label="t('cl.sch.day')" />
      <span class="min-w-0 flex-1 truncate font-semibold">{{ title }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <SelectButton v-model="mode" :options="modeOpts" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap">
        <template #option="{ option }"><i :class="option.icon" class="mr-1 text-xs" />{{ option.label }}</template>
      </SelectButton>
      <Select v-if="mode === 'week'" v-model="weekDoctor" :options="weekDoctorOpts" option-label="label" option-value="value" class="min-w-40" />
    </div>
    <div v-if="mode !== 'week' && counts.length" class="flex flex-wrap gap-2 text-xs">
      <span v-for="c in counts" :key="c.id" class="flex items-center gap-1 rounded-full border border-[var(--k-border)] px-2 py-0.5">
        <span class="size-2 rounded-full" :style="{ background: c.color }" />{{ c.name }} <b>{{ c.n }}</b>
      </span>
    </div>

    <TimeGrid v-if="mode !== 'list'" :columns="columns" :items="items" :from="win[0]" :to="win[1]" :step="step" :now="showNow ? nowMin : null" @pick="onPick" @open="openAppt" />

    <section v-else class="card flex flex-col !py-1">
      <p v-if="!rows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('cl.sch.none') }}</p>
      <div v-for="a in rows" :key="a.id" class="flex items-center gap-3 border-b border-[var(--k-border)] py-2 last:border-0" :class="{ 'opacity-50': a.status === 'CANCELLED' || a.status === 'NO_SHOW' }">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openAppt(a.id)">
          <span class="w-12 shrink-0 text-center">
            <span class="block font-semibold tabular-nums">{{ a.start }}</span>
            <span class="block text-[11px] text-[var(--k-muted)]">{{ t('cl.sch.min', { n: a.minutes }) }}</span>
          </span>
          <span class="h-9 w-1 shrink-0 rounded-full" :style="{ background: cl.doctor(a.doctor_id)?.color ?? GREY }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ a.name }}</span>
            <span class="block truncate text-xs text-[var(--k-muted)]">{{ [a.code, cl.doctor(a.doctor_id)?.name, cl.room(a.room_id)?.name, a.reason].filter(Boolean).join(' · ') }}</span>
          </span>
        </button>
        <Button v-if="a.status === 'BOOKED' && a.date === today()" :label="t('cl.sch.checkIn')" icon="pi pi-sign-in" size="small" outlined @click="arrive(a)" />
        <Tag v-else :severity="statusSev(a)" :value="statusLabel(a)" />
      </div>
    </section>

    <p class="text-xs text-[var(--k-muted)]"><i class="pi pi-info-circle mr-1" />{{ t('cl.sch.gridHint') }}</p>
    <ApptDialog v-model:open="dlg" :appt="editing" :preset="preset" @changed="load" @checked-in="(id) => router.push(`/v/${id}`)" />
  </div>
</template>
