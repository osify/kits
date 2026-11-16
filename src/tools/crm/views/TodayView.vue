<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { db, dbState } from '../db'
import { birthdaysSoon, completeFollowup, dueFollowups, snoozeFollowup, totalsOwed, type DueRow } from '../db/data'
import { useCrm, telLink, tgLink } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** What needs attention today: follow-ups due/overdue, money owed, birthdays coming up. */
const { t } = useI18n()
const crm = useCrm()
const due = ref<DueRow[]>([])
const owed = ref({ khr: 0, usd: 0, customers: 0 })
const birthdays = ref<Awaited<ReturnType<typeof birthdaysSoon>>>([])

async function load() {
  ;[due.value, owed.value, birthdays.value] = await Promise.all([dueFollowups(db, today()), totalsOwed(db), birthdaysSoon(db, new Date(), 14)])
}
watch(() => crm.version, load, { immediate: true })

async function done(r: DueRow) {
  await completeFollowup(db, r.id, dbState.deviceId)
  await crm.load()
}
async function later(r: DueRow, days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  await snoozeFollowup(db, r.id, today(d))
  await crm.load()
}
const overdue = (d: string) => d < today()
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('crm.nav.today') }}</h1>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="card">
        <div class="text-sm text-[var(--k-muted)]">{{ t('crm.dueCount') }}</div>
        <div class="text-2xl font-bold tabular-nums" :class="{ 'text-amber-700 dark:text-amber-400': due.length }">{{ due.length }}</div>
      </div>
      <RouterLink :to="{ path: '/list', query: { owing: '1' } }" class="card hover:border-primary-500">
        <div class="text-sm text-[var(--k-muted)]">{{ t('crm.owedTotal', { n: owed.customers }) }}</div>
        <div class="text-xl font-bold tabular-nums">{{ formatMoney(owed.khr, 'KHR') }}</div>
        <div v-if="owed.usd" class="font-semibold tabular-nums">+ {{ formatMoney(owed.usd, 'USD') }}</div>
      </RouterLink>
      <div class="card col-span-2 sm:col-span-1">
        <div class="text-sm text-[var(--k-muted)]">{{ t('crm.birthdays') }}</div>
        <div class="text-2xl font-bold tabular-nums">{{ birthdays.length }}</div>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('crm.followups') }}</h2>
      <p v-if="!due.length" class="rounded-xl border border-dashed border-[var(--k-border)] py-8 text-center text-[var(--k-muted)]">{{ t('crm.noneDue') }}</p>
      <ul v-else class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <li v-for="r in due" :key="r.id" class="flex flex-wrap items-center gap-2 px-4 py-3">
          <RouterLink :to="`/c/${r.customer_id}`" class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ r.name }}</span>
            <span class="block truncate text-sm text-[var(--k-muted)]">
              <span :class="overdue(r.due) ? 'font-semibold text-red-600' : ''">{{ overdue(r.due) ? t('crm.overdue', { date: r.due }) : t('crm.today') }}</span>
              <template v-if="r.note"> · {{ r.note }}</template>
            </span>
          </RouterLink>
          <a v-if="telLink(r.phone)" :href="telLink(r.phone)!" class="p-button p-button-text p-button-rounded p-button-icon-only" :aria-label="t('crm.call')"><i class="pi pi-phone" /></a>
          <a v-if="tgLink(r.telegram)" :href="tgLink(r.telegram)!" target="_blank" rel="noopener" class="p-button p-button-text p-button-rounded p-button-icon-only" aria-label="Telegram"><i class="pi pi-telegram" /></a>
          <Button :label="t('crm.later')" size="small" text severity="secondary" @click="later(r, 3)" />
          <Button :label="t('crm.done')" icon="pi pi-check" size="small" @click="done(r)" />
        </li>
      </ul>
    </section>

    <section v-if="birthdays.length" class="flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('crm.birthdaysSoon') }}</h2>
      <ul class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <li v-for="b in birthdays" :key="b.id">
          <RouterLink :to="`/c/${b.id}`" class="flex items-center gap-3 px-4 py-2.5">
            <span aria-hidden="true">🎂</span>
            <span class="flex-1">{{ b.name }}</span>
            <span class="text-sm text-[var(--k-muted)]">{{ b.inDays === 0 ? t('crm.today') : t('crm.inDays', { n: b.inDays }) }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
