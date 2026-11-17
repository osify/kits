<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { db } from '../db'
import { saveDoctor, saveRoom, type Doctor, type Room } from '../db/data'
import { COLORS, DURATIONS, normalizeHours, parseHours, type Hours } from '../schedule'
import { useClinic } from '../store'

/** Doctors (weekly hours, usual room, slot length, colour) and rooms, for the schedule. */
const { t, locale } = useI18n()
const router = useRouter()
const cl = useClinic()
const ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday first
const dayName = (d: number) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', { weekday: 'long', timeZone: 'UTC' })

// ── Doctor ──────────────────────────────────────────────────────────────────
interface DayRow {
  d: number
  on: boolean
  ranges: [string, string][]
}
const docOpen = ref(false)
const doc = reactive({ id: undefined as string | undefined, name: '', title: '', license: '', phone: '', color: COLORS[0], slot_min: 15, room_id: null as string | null, active: true })
const week = ref<DayRow[]>([])
const DEFAULT: Hours = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [String(d), [['08:00', '12:00'], ['14:00', '17:00']]]))
function editDoctor(d?: Doctor) {
  const first = !cl.doctors.length
  Object.assign(doc, {
    id: d?.id, name: d?.name ?? (first ? (cl.settings.doctor ?? '') : ''), title: d?.title ?? '', license: d?.license ?? (first ? (cl.settings.license ?? '') : ''),
    phone: d?.phone ?? '', color: d?.color ?? COLORS[cl.doctors.length % COLORS.length], slot_min: d?.slot_min ?? 15, room_id: d?.room_id ?? null, active: d ? !!d.active : true,
  })
  const h = d ? parseHours(d.hours) : DEFAULT
  week.value = ORDER.map((n) => {
    const r = h[String(n)] ?? []
    return { d: n, on: r.length > 0, ranges: r.length ? r.map(([a, b]) => [a, b] as [string, string]) : [['08:00', '12:00']] }
  })
  docOpen.value = true
}
function copyToAll(row: DayRow) {
  for (const w of week.value) if (w !== row && w.d !== 0) Object.assign(w, { on: row.on, ranges: row.ranges.map(([a, b]) => [a, b] as [string, string]) })
}
async function saveDoc() {
  if (!doc.name.trim()) return
  const h: Hours = {}
  for (const w of week.value) if (w.on) h[String(w.d)] = w.ranges
  await saveDoctor(db, { ...doc, hours: JSON.stringify(normalizeHours(h)), active: doc.active ? 1 : 0 })
  docOpen.value = false
  await cl.load()
}
const roomOpts = computed(() => [{ label: t('cl.sch.noRoom'), value: null }, ...cl.activeRooms.map((r) => ({ label: r.name, value: r.id }))])
const slotOpts = computed(() => DURATIONS.map((m) => ({ label: t('cl.sch.min', { n: m }), value: m })))
function hoursText(d: Doctor) {
  const h = parseHours(d.hours)
  const days = ORDER.filter((n) => h[String(n)]?.length)
  if (!days.length) return t('cl.sch.anyTime')
  return days.map((n) => `${dayName(n).slice(0, 3)} ${h[String(n)].map(([a, b]) => `${a}–${b}`).join(', ')}`).join(' · ')
}

// ── Room ────────────────────────────────────────────────────────────────────
const roomOpen = ref(false)
const room = reactive({ id: undefined as string | undefined, name: '', active: true })
function editRoom(r?: Room) {
  Object.assign(room, { id: r?.id, name: r?.name ?? '', active: r ? !!r.active : true })
  roomOpen.value = true
}
async function saveRm() {
  if (!room.name.trim()) return
  await saveRoom(db, { id: room.id, name: room.name, active: room.active ? 1 : 0 })
  roomOpen.value = false
  await cl.load()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.push('/schedule')" />
      <h1 class="flex-1 text-xl font-semibold">{{ t('cl.sch.setup') }}</h1>
    </div>

    <section class="card flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold"><i class="pi pi-user mr-1" />{{ t('cl.sch.doctors') }}</h2>
        <Button :label="t('cl.sch.addDoctor')" icon="pi pi-plus" size="small" text @click="editDoctor()" />
      </div>
      <p v-if="!cl.doctors.length" class="text-sm text-[var(--k-muted)]">{{ t('cl.sch.noDoctors') }}</p>
      <button
        v-for="d in cl.doctors"
        :key="d.id"
        type="button"
        class="flex items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--k-border)]/40"
        :class="{ 'opacity-50': !d.active }"
        @click="editDoctor(d)"
      >
        <span class="size-3 shrink-0 rounded-full" :style="{ background: d.color }" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ d.name }}<span v-if="d.title" class="font-normal text-[var(--k-muted)]"> · {{ d.title }}</span></span>
          <span class="block truncate text-xs text-[var(--k-muted)]">{{ [cl.room(d.room_id)?.name, t('cl.sch.min', { n: d.slot_min }), hoursText(d)].filter(Boolean).join(' · ') }}</span>
        </span>
        <i class="pi pi-chevron-right text-[var(--k-muted)]" />
      </button>
    </section>

    <section class="card flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold"><i class="pi pi-building mr-1" />{{ t('cl.sch.rooms') }}</h2>
        <Button :label="t('cl.sch.addRoom')" icon="pi pi-plus" size="small" text @click="editRoom()" />
      </div>
      <p v-if="!cl.rooms.length" class="text-sm text-[var(--k-muted)]">{{ t('cl.sch.noRooms') }}</p>
      <button
        v-for="r in cl.rooms"
        :key="r.id"
        type="button"
        class="flex items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--k-border)]/40"
        :class="{ 'opacity-50': !r.active }"
        @click="editRoom(r)"
      >
        <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
        <span class="text-xs text-[var(--k-muted)]">{{ cl.activeDoctors.filter((d) => d.room_id === r.id).map((d) => d.name).join(', ') }}</span>
        <i class="pi pi-chevron-right text-[var(--k-muted)]" />
      </button>
    </section>

    <Dialog v-model:visible="docOpen" modal :header="doc.id ? t('cl.sch.editDoctor') : t('cl.sch.addDoctor')" class="w-[min(34rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="saveDoc">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="doc.name" autofocus :placeholder="t('cl.doctorPh')" /></label>
          <label class="field"><span>{{ t('cl.sch.specialty') }}</span><InputText v-model="doc.title" :placeholder="t('cl.sch.specialtyPh')" /></label>
          <label class="field"><span>{{ t('cl.licenseNo') }}</span><InputText v-model="doc.license" /></label>
          <label class="field"><span>{{ t('cl.phone') }}</span><InputText v-model="doc.phone" inputmode="tel" /></label>
          <label class="field"><span>{{ t('cl.sch.usualRoom') }}</span><Select v-model="doc.room_id" :options="roomOpts" :placeholder="t('cl.sch.noRoom')" option-label="label" option-value="value" /></label>
          <label class="field"><span>{{ t('cl.sch.slot') }}</span><Select v-model="doc.slot_min" :options="slotOpts" option-label="label" option-value="value" /></label>
        </div>
        <div class="field">
          <span>{{ t('cl.sch.color') }}</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="size-7 rounded-full ring-offset-2 ring-offset-[var(--k-surface)]"
              :class="{ 'ring-2 ring-[var(--k-text)]': doc.color === c }"
              :style="{ background: c }"
              :aria-label="c"
              @click="doc.color = c"
            />
          </div>
        </div>

        <div class="field">
          <span>{{ t('cl.sch.hours') }}</span>
          <p class="text-xs text-[var(--k-muted)]">{{ t('cl.sch.hoursHint') }}</p>
          <div class="flex flex-col divide-y divide-[var(--k-border)]">
            <div v-for="w in week" :key="w.d" class="flex flex-wrap items-center gap-2 py-1.5">
              <label class="flex w-32 items-center gap-2 text-sm"><ToggleSwitch v-model="w.on" />{{ dayName(w.d) }}</label>
              <template v-if="w.on">
                <div class="flex flex-col gap-1">
                  <div v-for="(r, i) in w.ranges" :key="i" class="flex items-center gap-1">
                    <input v-model="r[0]" type="time" class="rounded-lg border border-[var(--k-border)] bg-transparent px-2 py-1 text-sm" :aria-label="t('cl.sch.from')" />
                    –
                    <input v-model="r[1]" type="time" class="rounded-lg border border-[var(--k-border)] bg-transparent px-2 py-1 text-sm" :aria-label="t('cl.sch.to')" />
                    <Button v-if="w.ranges.length > 1" icon="pi pi-times" text rounded size="small" severity="secondary" :aria-label="t('hl.delete')" @click="w.ranges.splice(i, 1)" />
                  </div>
                </div>
                <Button v-if="w.ranges.length < 3" icon="pi pi-plus" text rounded size="small" v-tooltip="t('cl.sch.addShift')" :aria-label="t('cl.sch.addShift')" @click="w.ranges.push(['17:00', '20:00'])" />
                <Button v-if="w.d === 1" :label="t('cl.sch.copyAll')" text size="small" @click="copyToAll(w)" />
              </template>
              <span v-else class="text-sm text-[var(--k-muted)]">{{ t('cl.sch.dayOff') }}</span>
            </div>
          </div>
        </div>
        <label v-if="doc.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="doc.active" /> {{ t('cl.sch.working') }}</label>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="docOpen = false" />
          <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!doc.name.trim()" />
        </div>
      </form>
    </Dialog>

    <Dialog v-model:visible="roomOpen" modal :header="room.id ? t('cl.sch.editRoom') : t('cl.sch.addRoom')" class="w-[min(22rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="saveRm">
        <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="room.name" autofocus :placeholder="t('cl.sch.roomPh')" /></label>
        <label v-if="room.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="room.active" /> {{ t('cl.inUse') }}</label>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="roomOpen = false" />
          <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!room.name.trim()" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
