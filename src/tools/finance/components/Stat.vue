<script setup lang="ts">
/** A labelled number (headline value + optional sub-line). */
defineProps<{ label: string; value: string; sub?: string; hero?: boolean; tone?: 'warn' | 'good' }>()
</script>

<template>
  <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4" :class="{ 'sm:col-span-2': hero }">
    <div class="text-sm text-[var(--k-muted)]">{{ label }}</div>
    <div
      class="font-bold tabular-nums"
      :class="[hero ? 'text-3xl' : 'text-xl', tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'good' ? 'text-primary-600 dark:text-primary-400' : '']"
    >
      {{ value }}
    </div>
    <div v-if="sub" class="text-xs text-[var(--k-muted)]">{{ sub }}</div>
  </div>
</template>
