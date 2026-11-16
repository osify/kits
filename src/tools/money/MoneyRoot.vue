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
import TxnDialog from './components/TxnDialog.vue'
import { dbState, openMoneyDb, useHere } from './db'
import { useBook } from './store'
import { isDirty, moneyBackup, startAutoBackup } from './backup'
import { prefs } from '@/core/util/prefs'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const book = useBook()
const appReady = ref(false)
const addOpen = ref(false)

const nav = computed(() => [
  { to: '/', icon: 'pi pi-calendar', label: t('money.nav.month') },
  { to: '/report', icon: 'pi pi-chart-bar', label: t('money.nav.report') },
  { to: '/settings', icon: 'pi pi-cog', label: t('money.nav.settings') },
  { to: '/backup', icon: 'pi pi-cloud-upload', label: t('money.nav.backup') },
])

watch(
  () => dbState.status,
  async (s) => {
    if (s !== 'ready') return void (appReady.value = false)
    await book.load()
    startAutoBackup()
    appReady.value = true
    if (!book.ready && route.name !== 'welcome') router.replace('/welcome')
  },
)
onMounted(openMoneyDb)

const isWelcome = computed(() => route.name === 'welcome')
/** Remind 3 days after the last backup, or 3 days after the book was started if never backed up. */
const remind = computed(() => {
  if (!book.ready || isWelcome.value || route.path === '/backup' || !isDirty()) return false
  const since = moneyBackup.lastBackupAt || Number(prefs.get('money.firstUse') || Date.now())
  return Date.now() - since > 3 * 86_400_000
})
</script>

<template>
  <Toast position="top-center" />
  <ConfirmDialog />
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b border-[var(--k-border)] bg-[var(--k-surface)]/95 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <a href="/" class="flex items-center gap-2 font-semibold" :aria-label="t('common.home')">
          <img src="/icons/kitroid.svg" alt="" class="size-8" />
          <span class="hidden sm:inline">{{ t('money.title') }}</span>
        </a>
        <span v-if="book.name" class="truncate text-sm text-[var(--k-muted)]">· {{ book.name }}</span>
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
        <span class="flex-1" />
        <Button :label="t('money.add')" icon="pi pi-plus" size="small" @click="addOpen = true" />
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-28 md:pb-8">
      <div v-if="dbState.status === 'opening' || dbState.status === 'idle' || (dbState.status === 'ready' && !appReady)" class="flex flex-col items-center gap-3 py-24 text-[var(--k-muted)]">
        <ProgressSpinner style="width: 48px; height: 48px" />
      </div>
      <div v-else-if="dbState.status === 'busy' || dbState.status === 'moved'" class="mx-auto max-w-md py-16 text-center">
        <i class="pi pi-clone mb-4 text-4xl text-[var(--k-muted)]" />
        <h1 class="mb-2 text-xl font-semibold">{{ t('money.otherTab') }}</h1>
        <Button :label="t('money.useHere')" icon="pi pi-arrow-down-left" @click="useHere" />
      </div>
      <Message v-else-if="dbState.status === 'error'" severity="error" :closable="false">{{ dbState.error }}</Message>
      <template v-else>
        <Message v-if="dbState.engine === 'memory'" severity="warn" class="mb-4" :closable="false">{{ t('pos.db.memoryWarn') }}</Message>
        <Message v-if="remind" severity="warn" class="mb-4" :closable="false">
          {{ t('money.bk.remind') }} <RouterLink to="/backup" class="font-semibold underline">{{ t('money.bk.backupNow') }}</RouterLink>
        </Message>
        <RouterView />
      </template>
    </main>

    <button
      v-if="appReady && !isWelcome"
      type="button"
      class="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-primary-600 text-2xl text-white shadow-lg md:hidden"
      :aria-label="t('money.add')"
      @click="addOpen = true"
    >
      <i class="pi pi-plus" />
    </button>
    <nav v-if="appReady && !isWelcome" class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--k-border)] bg-[var(--k-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <RouterLink
        v-for="n in nav"
        :key="n.to"
        :to="n.to"
        class="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-tight text-[var(--k-muted)]"
        exact-active-class="!text-primary-600 dark:!text-primary-400"
      >
        <i :class="n.icon" class="text-lg" />
        <span class="line-clamp-1">{{ n.label }}</span>
      </RouterLink>
    </nav>

    <TxnDialog v-model:visible="addOpen" :txn="null" @saved="book.load()" />
  </div>
</template>
