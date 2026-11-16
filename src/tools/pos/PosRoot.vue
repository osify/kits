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
import DisclaimerDialog from './components/DisclaimerDialog.vue'
import { dbState, openPosDb, useHere, getSetting } from './db'
import { useShopStore } from './stores/shop'
import { useCatalogStore } from './stores/catalog'
import { startAutoBackup, daysSinceBackup, isDirty } from './backup'
import { NAV } from './nav'
import { startAutoSync, setOnApplied } from './sync'
import { applyLicenseKey } from '@/core/license'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const shop = useShopStore()
const cat = useCatalogStore()
const appReady = ref(false)

const nav = computed(() => NAV.map((n) => ({ ...n, label: t(`pos.nav.${n.key}`) })))
const bottom = computed(() => [
  ...nav.value.filter((n) => n.main),
  { to: '/more', key: 'more', icon: 'pi pi-bars', label: t('pos.nav.more') },
])
const moreActive = computed(() => !NAV.some((n) => n.main && n.to === route.path))

// Once the database is open in this tab: load the shop, the menu, start auto backup.
watch(
  () => dbState.status,
  async (s) => {
    if (s !== 'ready') {
      appReady.value = false
      return
    }
    await shop.load()
    await cat.load()
    await applyLicenseKey(await getSetting('license'))
    startAutoBackup()
    setOnApplied(async () => {
      await shop.load()
      await cat.load()
      await applyLicenseKey(await getSetting('license'))
    })
    startAutoSync()
    appReady.value = true
    if (!shop.shop && route.name !== 'welcome') router.replace('/welcome')
  },
)

onMounted(openPosDb)

const remind = computed(() => {
  if (!shop.shop || route.name === 'backup' || route.name === 'welcome') return null
  const d = daysSinceBackup()
  if (!isDirty() || d < 3) return null
  return d === Infinity ? t('pos.bk.remindNever') : t('pos.bk.remind', { n: Math.floor(d) })
})
const isWelcome = computed(() => route.name === 'welcome')
</script>

<template>
  <Toast position="top-center" />
  <ConfirmDialog />
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b border-[var(--k-border)] bg-[var(--k-surface)]/95 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <a href="/" class="flex items-center gap-2 font-semibold" :aria-label="t('common.home')">
          <img src="/icons/kitroid.svg" alt="" class="size-8" />
          <span class="hidden sm:inline">{{ t('pos.title') }}</span>
        </a>
        <span v-if="shop.shop" class="truncate text-sm text-[var(--k-muted)]">· {{ shop.shop.name }}</span>
        <span class="flex-1" />
        <LangToggle />
      </div>
      <UpdateBanner />
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-36 md:pb-24 lg:pb-6">
      <div v-if="dbState.status === 'opening' || dbState.status === 'idle' || (dbState.status === 'ready' && !appReady)" class="flex flex-col items-center gap-3 py-24 text-[var(--k-muted)]">
        <ProgressSpinner style="width: 48px; height: 48px" />
        <p>{{ t('pos.db.opening') }}</p>
      </div>

      <div v-else-if="dbState.status === 'busy' || dbState.status === 'moved'" class="mx-auto max-w-md py-16 text-center">
        <i class="pi pi-clone mb-4 text-4xl text-[var(--k-muted)]" />
        <h1 class="mb-2 text-xl font-semibold">
          {{ dbState.status === 'busy' ? t('pos.db.busyTitle') : t('pos.db.movedTitle') }}
        </h1>
        <p class="mb-6 text-[var(--k-muted)]">
          {{ dbState.status === 'busy' ? t('pos.db.busyBody') : t('pos.db.movedBody') }}
        </p>
        <Button :label="dbState.status === 'busy' ? t('pos.db.useHere') : t('pos.db.reopen')" icon="pi pi-arrow-down-left" @click="useHere" />
      </div>

      <div v-else-if="dbState.status === 'error'" class="mx-auto max-w-md py-16">
        <Message severity="error" :closable="false">
          <div class="font-semibold">{{ t('pos.db.errorTitle') }}</div>
          <div class="text-sm">{{ dbState.error }}</div>
        </Message>
        <Button class="mt-4" :label="t('common.retry')" icon="pi pi-refresh" @click="openPosDb" />
      </div>

      <template v-else>
        <Message v-if="dbState.engine === 'memory'" severity="warn" class="mb-4" :closable="false">{{ t('pos.db.memoryWarn') }}</Message>
        <Message v-if="remind" severity="warn" class="mb-4" :closable="false">
          <span>{{ remind }}</span>
          <RouterLink to="/backup" class="ml-2 font-semibold underline">{{ t('pos.bk.remindAction') }}</RouterLink>
        </Message>
        <div class="md:flex md:gap-6">
          <nav v-if="!isWelcome" class="hidden w-44 shrink-0 md:block" :aria-label="t('pos.title')">
            <ul class="sticky top-20 flex flex-col gap-1">
              <li v-for="n in nav" :key="n.to">
                <RouterLink
                  :to="n.to"
                  class="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--k-border)]/50"
                  exact-active-class="bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                >
                  <i :class="n.icon" />
                  <span>{{ n.label }}</span>
                </RouterLink>
              </li>
            </ul>
          </nav>
          <div class="min-w-0 flex-1">
            <RouterView />
          </div>
        </div>
        <DisclaimerDialog />
      </template>
    </main>

    <!-- Bottom tab bar on phones -->
    <nav
      v-if="dbState.status === 'ready' && appReady && !isWelcome"
      class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--k-border)] bg-[var(--k-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <RouterLink
        v-for="n in bottom"
        :key="n.to"
        :to="n.to"
        class="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-tight text-[var(--k-muted)]"
        :class="{ '!text-primary-600 dark:!text-primary-400': n.to === '/more' && moreActive }"
        exact-active-class="!text-primary-600 dark:!text-primary-400"
      >
        <i :class="n.icon" class="text-lg" />
        <span class="line-clamp-1 text-center">{{ n.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
