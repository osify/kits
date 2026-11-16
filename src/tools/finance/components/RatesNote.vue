<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CHECKED, SOURCES } from '../rates'

/** "Rates checked on … – confirm with GDT / NSSF" with source links. */
const { t } = useI18n()
</script>

<template>
  <details class="no-print text-xs text-[var(--k-muted)]">
    <summary class="cursor-pointer">{{ t('fin.tax.checked', { date: CHECKED }) }}</summary>
    <ul class="mt-1 list-inside list-disc">
      <li v-for="s in SOURCES" :key="s.url">
        <a :href="s.url" target="_blank" rel="noopener" class="underline">{{ s.label }}</a>
      </li>
    </ul>
  </details>
</template>
