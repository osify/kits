<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NAV } from '../nav'

const { t } = useI18n()
const extra = NAV.filter((n) => !n.main)
</script>

<template>
  <div class="flex flex-col gap-3">
    <h1 class="text-xl font-semibold">{{ t('pos.nav.more') }}</h1>
    <ul class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="n in extra" :key="n.to">
        <RouterLink :to="n.to" class="flex items-center gap-3 px-4 py-3">
          <i :class="n.icon" class="text-lg text-primary-600" />
          <span class="flex-1">{{ t(`pos.nav.${n.key}`) }}</span>
          <i class="pi pi-angle-right text-[var(--k-muted)]" />
        </RouterLink>
      </li>
    </ul>
    <a href="/" class="mt-2 text-center text-sm text-[var(--k-muted)] underline">kitroid.com</a>
  </div>
</template>
