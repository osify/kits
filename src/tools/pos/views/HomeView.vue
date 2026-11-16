<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { dbState } from '../db'
import { useShopStore } from '../stores/shop'
import { summary, type Summary } from '../db/reports'
import { today } from '../db/sales'
import { backupState, daysSinceBackup } from '../backup'
import { storageHealth, requestPersist, formatBytes, isIosBrowserTab, type StorageHealth } from '@/core/util/storage'

const { t } = useI18n()
const toast = useToast()
const shop = useShopStore()
const health = ref<StorageHealth | null>(null)
const todaySum = ref<Summary | null>(null)
const showIosHint = ref(false)

onMounted(async () => {
  showIosHint.value = isIosBrowserTab()
  health.value = await storageHealth()
  todaySum.value = await summary(today(), today(), shop.base)
})

watch(dataVersion, async () => (todaySum.value = await summary(today(), today(), shop.base)))

async function onPersist() {
  const ok = await requestPersist()
  health.value = await storageHealth()
  if (!ok) toast.add({ severity: 'warn', summary: t('pos.home.persistDenied'), life: 6000 })
}

const backupAge = computed(() => daysSinceBackup())
const engineLabel = computed(() => (dbState.engine === 'opfs' ? t('pos.home.engineOpfs') : t('pos.home.engineMemory')))
const actions = computed(() => [
  { to: '/sell', icon: 'pi pi-shopping-cart', label: t('pos.nav.sell'), body: t('pos.home.sellBody') },
  { to: '/quick', icon: 'pi pi-bolt', label: t('pos.nav.quick'), body: t('pos.home.quickBody') },
  { to: '/summary', icon: 'pi pi-chart-bar', label: t('pos.nav.summary'), body: t('pos.home.summaryBody') },
  { to: '/setup', icon: 'pi pi-box', label: t('pos.nav.setup'), body: t('pos.home.setupBody') },
])
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <h1 class="text-2xl font-semibold">{{ shop.shop?.name }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('pos.tagline') }}</p>
    </div>

    <Message v-if="showIosHint" severity="info" :closable="false">{{ t('pos.home.iosInstall') }}</Message>

    <RouterLink to="/summary" class="block rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 hover:border-primary-500">
      <div class="text-sm text-[var(--k-muted)]">{{ t('pos.home.todaySales') }}</div>
      <div class="text-3xl font-bold tabular-nums">{{ shop.fmt(todaySum?.net ?? 0) }}</div>
      <div class="text-sm text-[var(--k-muted)]">
        {{ t('pos.sum.salesN', { n: todaySum?.posCount ?? 0 }) }} · {{ t('pos.quick.itemsSold', { n: todaySum?.items ?? 0 }) }}
      </div>
    </RouterLink>

    <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li v-for="a in actions" :key="a.to">
        <RouterLink :to="a.to" class="flex h-full flex-col gap-1 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 hover:border-primary-500">
          <i :class="a.icon" class="text-2xl text-primary-600" />
          <span class="font-semibold">{{ a.label }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ a.body }}</span>
        </RouterLink>
      </li>
    </ul>

    <RouterLink to="/backup" class="flex items-center gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 hover:border-primary-500">
      <i class="pi text-2xl" :class="backupAge > 3 ? 'pi-exclamation-triangle text-amber-600' : 'pi-cloud text-primary-600'" />
      <span class="flex-1">
        <span class="block font-semibold">{{ t('pos.nav.backup') }}</span>
        <span class="text-sm text-[var(--k-muted)]">
          {{ backupState.lastBackupAt ? t('pos.bk.last', { when: new Date(backupState.lastBackupAt).toLocaleString() }) : t('pos.bk.neverLong') }}
        </span>
      </span>
      <i class="pi pi-angle-right" />
    </RouterLink>

    <details class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <summary class="cursor-pointer font-semibold">{{ t('pos.home.status') }}</summary>
      <dl class="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt class="text-[var(--k-muted)]">{{ t('pos.home.storage') }}</dt>
        <dd>{{ engineLabel }} · SQLite {{ dbState.sqliteVersion }}</dd>
        <dt class="text-[var(--k-muted)]">{{ t('pos.home.persistent') }}</dt>
        <dd class="flex flex-wrap items-center gap-2">
          <Tag :severity="health?.persisted ? 'success' : 'warn'" :value="health?.persisted ? t('pos.home.persistYes') : t('pos.home.persistNo')" />
          <Button v-if="health && !health.persisted" size="small" text :label="t('pos.home.persistAsk')" @click="onPersist" />
        </dd>
        <dt class="text-[var(--k-muted)]">{{ t('pos.home.used') }}</dt>
        <dd>{{ formatBytes(health?.usage ?? null) }} / {{ formatBytes(health?.quota ?? null) }}</dd>
        <dt class="text-[var(--k-muted)]">{{ t('pos.home.schema') }}</dt>
        <dd>v{{ dbState.schemaVersion }}</dd>
        <dt class="text-[var(--k-muted)]">{{ t('pos.home.device') }}</dt>
        <dd class="font-mono text-xs break-all">{{ dbState.deviceId }}</dd>
      </dl>
    </details>
  </div>
</template>
