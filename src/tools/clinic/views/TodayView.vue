<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Tag from 'primevue/tag'
import StartVisit from '../components/StartVisit.vue'
import { db } from '../db'
import { followupsDue, listVisitsOn, type VisitRow } from '../db/data'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** The day's queue (waiting / done), money of the day, follow-ups due. */
const { t } = useI18n()
const router = useRouter()
const cl = useClinic()
const day = ref(new Date())
const dayStr = computed(() => today(day.value))
const rows = ref<VisitRow[]>([])
const due = ref<VisitRow[]>([])
const starting = ref(false)
async function load() {
  ;[rows.value, due.value] = await Promise.all([listVisitsOn(db, dayStr.value), followupsDue(db, dayStr.value)])
}
onMounted(load)
watch([dayStr, () => cl.version], load)
const m = (v: number) => formatMoney(v, cl.currency)
const waiting = computed(() => rows.value.filter((r) => r.status === 'WAITING'))
const done = computed(() => rows.value.filter((r) => r.status === 'DONE'))
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
          <span class="block text-xs text-[var(--k-muted)]">{{ v.code }}<template v-if="v.complaint"> · {{ v.complaint }}</template></span>
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
          <span class="block text-xs text-[var(--k-muted)]">{{ v.code }}</span>
        </span>
        <span class="text-right">
          <span class="block font-semibold tabular-nums">{{ m(v.total) }}</span>
          <Tag v-if="v.paid < v.total" severity="warn" :value="t('cl.owes', { amount: m(v.total - v.paid) })" />
        </span>
      </button>
    </section>

    <section v-if="due.length" class="card flex flex-col gap-1">
      <h2 class="font-semibold"><i class="pi pi-calendar mr-1 text-primary-600" />{{ t('cl.followupsDue') }}</h2>
      <RouterLink v-for="v in due" :key="v.id" :to="`/p/${v.patient_id}`" class="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-[var(--k-border)]/40">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ v.name }}</span>
          <span class="block text-xs text-[var(--k-muted)]">{{ v.code }} · {{ t('cl.followupOn', { date: v.followup_date }) }}</span>
        </span>
        <i class="pi pi-chevron-right text-[var(--k-muted)]" />
      </RouterLink>
    </section>

    <StartVisit v-model:open="starting" :date="dayStr" @started="(id) => router.push(`/v/${id}`)" />
  </div>
</template>
