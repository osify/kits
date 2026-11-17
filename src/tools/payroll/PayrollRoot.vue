<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import LangToggle from '@/components/LangToggle.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'
import LockScreen from '@/components/LockScreen.vue'
import { appLock as lock, backup, dbState, openPayrollDb, useHere } from './db'
import { usePayroll } from './store'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const pr = usePayroll()
const appReady = ref(false)
const nav = computed(() => [
  { to: '/', icon: 'pi pi-calendar', label: t('pr.nav.month') },
  { to: '/staff', icon: 'pi pi-users', label: t('pr.nav.staff') },
  { to: '/year', icon: 'pi pi-chart-bar', label: t('pr.nav.year') },
  { to: '/more', icon: 'pi pi-cog', label: t('pr.nav.more') },
])

watch(
  () => dbState.status,
  async (s) => {
    if (s !== 'ready') return void (appReady.value = false)
    await pr.load()
    backup.startAutoBackup()
    appReady.value = true
    if (!pr.ready && route.name !== 'welcome') router.replace('/welcome')
  },
)
onMounted(() => {
  lock.start()
  openPayrollDb()
})
const isWelcome = computed(() => route.name === 'welcome')
const remind = computed(() => pr.ready && !isWelcome.value && route.path !== '/more' && backup.needsReminder())
</script>

<template>
  <Toast position="top-center" />
  <ConfirmDialog />
  <LockScreen :lock="lock" :title="t('pr.title')" />
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b border-[var(--k-border)] bg-[var(--k-surface)]/95 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <a href="/" class="flex items-center gap-2 font-semibold" :aria-label="t('common.home')">
          <img src="/icons/kitroid.svg" alt="" class="size-8" />
          <span class="hidden sm:inline">{{ t('pr.title') }}</span>
        </a>
        <span v-if="pr.name" class="truncate text-sm text-[var(--k-muted)]">· {{ pr.name }}</span>
        <span class="flex-1" />
        <LangToggle />
      </div>
      <UpdateBanner />
      <nav v-if="appReady && !isWelcome" class="mx-auto hidden max-w-5xl gap-1 px-4 pb-2 md:flex">
        <RouterLink
          v-for="n in nav"
          :key="n.to"
          :to="n.to"
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--k-border)]/50"
          exact-active-class="bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300"
        >
          <i :class="n.icon" />{{ n.label }}
        </RouterLink>
      </nav>
    </header>
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-24 md:pb-8">
      <div v-if="dbState.status === 'opening' || dbState.status === 'idle' || (dbState.status === 'ready' && !appReady)" class="flex justify-center py-24">
        <ProgressSpinner style="width: 48px; height: 48px" />
      </div>
      <div v-else-if="dbState.status === 'busy' || dbState.status === 'moved'" class="mx-auto max-w-md py-16 text-center">
        <i class="pi pi-clone mb-4 text-4xl text-[var(--k-muted)]" />
        <h1 class="mb-2 text-xl font-semibold">{{ t('pr.otherTab') }}</h1>
        <Button :label="t('pos.db.useHere')" icon="pi pi-arrow-down-left" @click="useHere" />
      </div>
      <Message v-else-if="dbState.status === 'error'" severity="error" :closable="false">{{ dbState.error }}</Message>
      <template v-else>
        <Message v-if="dbState.engine === 'memory'" severity="warn" class="mb-4" :closable="false">{{ t('pos.db.memoryWarn') }}</Message>
        <Message v-if="remind" severity="warn" class="mb-4" :closable="false">
          {{ t('bk.remind') }} <RouterLink to="/more" class="font-semibold underline">{{ t('bk.backupNow') }}</RouterLink>
        </Message>
        <RouterView v-if="!lock.state.locked" :key="route.fullPath.split('?')[0]" />
        <p class="mt-8 text-center text-xs text-[var(--k-muted)]">{{ t('pr.disclaimer') }}</p>
      </template>
    </main>
    <nav v-if="appReady && !isWelcome" class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--k-border)] bg-[var(--k-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <RouterLink
        v-for="n in nav"
        :key="n.to"
        :to="n.to"
        class="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] text-[var(--k-muted)]"
        exact-active-class="!text-primary-600 dark:!text-primary-400"
      >
        <i :class="n.icon" class="text-lg" />
        <span>{{ n.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
