<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { db } from '../db'
import { listCircles, type CircleRow } from '../db/data'
import { useTongtin } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** All savings circles: round progress, next date and unpaid shares. */
const { t } = useI18n()
const tt = useTongtin()
const rows = ref<CircleRow[] | null>(null)
const load = async () => (rows.value = await listCircles(db))
onMounted(load)
watch(() => tt.version, load)
const todayStr = today()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('tt.nav.circles') }}</h1>
      <RouterLink to="/new"><Button :label="t('tt.newCircle')" icon="pi pi-plus" /></RouterLink>
    </div>

    <div v-if="rows && !rows.length" class="card flex flex-col items-center gap-3 py-10 text-center">
      <i class="pi pi-sync text-4xl text-[var(--k-muted)]" />
      <p class="max-w-md text-[var(--k-muted)]">{{ t('tt.empty') }}</p>
      <RouterLink to="/new"><Button :label="t('tt.newCircle')" icon="pi pi-plus" /></RouterLink>
      <RouterLink to="/plan" class="text-sm underline">{{ t('tt.tryPlan') }}</RouterLink>
    </div>

    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="c in rows ?? []" :key="c.id">
        <RouterLink :to="`/c/${c.id}`" class="card flex flex-col gap-2 hover:border-primary-500" :class="{ 'opacity-60': c.closed_at }">
          <div class="flex items-start gap-2">
            <h2 class="min-w-0 flex-1 truncate font-semibold">{{ c.name }}</h2>
            <Tag v-if="c.closed_at" severity="secondary" :value="t('tt.closed')" />
            <Tag v-else-if="c.drawn >= c.hands && c.hands" severity="success" :value="t('tt.finished')" />
            <Tag v-else-if="c.unpaid" severity="warn" :value="t('tt.unpaidShares', { n: c.unpaid })" />
          </div>
          <p class="text-sm text-[var(--k-muted)]">
            {{ formatMoney(c.amount, c.currency) }} × {{ c.hands }} {{ t('tt.hands') }} · {{ t(`tt.every.${c.every}`) }} · {{ t(`tt.mode.${c.mode}`) }}
          </p>
          <div class="h-2 overflow-hidden rounded-full bg-[var(--k-border)]" role="progressbar" :aria-valuenow="c.drawn" :aria-valuemax="c.hands">
            <div class="h-full rounded-full bg-primary-600" :style="{ width: `${c.hands ? (c.drawn / c.hands) * 100 : 0}%` }" />
          </div>
          <div class="flex justify-between text-sm">
            <span>{{ t('tt.roundOf', { n: c.drawn, total: c.hands }) }}</span>
            <span v-if="c.next_date" :class="c.next_date <= todayStr ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-[var(--k-muted)]'">
              {{ t('tt.nextOn', { date: c.next_date }) }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
