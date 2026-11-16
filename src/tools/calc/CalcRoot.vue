<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LangToggle from '@/components/LangToggle.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'

const { t } = useI18n()
const tabs = computed(() => [
  { to: '/change', icon: 'pi pi-arrow-right-arrow-left', label: t('calc.tab.change') },
  { to: '/cash', icon: 'pi pi-money-bill', label: t('calc.tab.cash') },
  { to: '/vat', icon: 'pi pi-receipt', label: t('calc.tab.vat') },
  { to: '/discount', icon: 'pi pi-tag', label: t('calc.tab.discount') },
  { to: '/unit', icon: 'pi pi-sort-amount-down', label: t('calc.tab.unit') },
])
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b border-[var(--k-border)] bg-[var(--k-surface)]/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <a href="/" class="flex items-center gap-2 font-semibold" :aria-label="t('common.home')">
          <img src="/icons/kitroid.svg" alt="" class="size-8" />
          <span class="hidden sm:inline">{{ t('calc.title') }}</span>
        </a>
        <span class="flex-1" />
        <LangToggle />
      </div>
      <UpdateBanner />
      <nav class="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 md:flex">
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
    </main>
    <nav class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--k-border)] bg-[var(--k-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-tight text-[var(--k-muted)]"
        active-class="!text-primary-600 dark:!text-primary-400"
      >
        <i :class="tab.icon" class="text-lg" />
        <span class="line-clamp-1 text-center">{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
