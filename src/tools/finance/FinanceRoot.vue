<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LangToggle from '@/components/LangToggle.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'
import CurrencySwitch from './components/CurrencySwitch.vue'

const { t } = useI18n()
const tabs = computed(() => [
  { to: '/loan', icon: 'pi pi-building-columns', label: t('fin.tab.loan') },
  { to: '/savings', icon: 'pi pi-wallet', label: t('fin.tab.savings') },
  { to: '/profit', icon: 'pi pi-percentage', label: t('fin.tab.profit') },
  { to: '/breakeven', icon: 'pi pi-chart-line', label: t('fin.tab.breakeven') },
  { to: '/payroll', icon: 'pi pi-id-card', label: t('fin.tab.payroll') },
  { to: '/withholding', icon: 'pi pi-receipt', label: t('fin.tab.wht') },
])
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="no-print sticky top-0 z-20 border-b border-[var(--k-border)] bg-[var(--k-surface)]/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <a href="/" class="flex items-center gap-2 font-semibold" :aria-label="t('common.home')">
          <img src="/icons/kitroid.svg" alt="" class="size-8" />
          <span class="hidden sm:inline">{{ t('fin.title') }}</span>
        </a>
        <span class="flex-1" />
        <CurrencySwitch />
        <LangToggle />
      </div>
      <UpdateBanner />
      <nav class="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 md:flex" :aria-label="t('fin.title')">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--k-border)]/50"
          active-class="bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300"
        >
          <i :class="tab.icon" />{{ tab.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24 md:pb-8">
      <RouterView />
      <p class="no-print mt-8 text-center text-xs text-[var(--k-muted)]">{{ t('fin.disclaimer') }}</p>
    </main>

    <nav class="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-[var(--k-border)] bg-[var(--k-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] leading-tight text-[var(--k-muted)]"
        active-class="!text-primary-600 dark:!text-primary-400"
      >
        <i :class="tab.icon" class="text-lg" />
        <span class="line-clamp-1 text-center">{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
