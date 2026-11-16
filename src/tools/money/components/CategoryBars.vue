<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBook, catName } from '../store'
import type { CategoryTotal } from '../db/data'

/**
 * Magnitude by category: a single series, so one hue (amber for spending, blue for income,
 * both validated for light/dark). Each bar is labelled with its name and value directly,
 * so no legend is needed; the list itself is the table view.
 */
const props = defineProps<{ rows: CategoryTotal[]; kind: 'IN' | 'OUT' }>()
const { t, locale } = useI18n()
const book = useBook()
const color = computed(() => (props.kind === 'OUT' ? '#d97706' : '#2563eb'))
const list = computed(() => props.rows.filter((r) => r.kind === props.kind))
const max = computed(() => Math.max(1, ...list.value.map((r) => r.total)))
const sum = computed(() => list.value.reduce((s, r) => s + r.total, 0) || 1)
</script>

<template>
  <ul v-if="list.length" class="flex flex-col gap-2.5">
    <li v-for="r in list" :key="r.category_id ?? 'none'" class="text-sm">
      <div class="mb-1 flex items-baseline gap-2">
        <span aria-hidden="true">{{ r.icon }}</span>
        <span class="min-w-0 flex-1 truncate">{{ catName(r, locale) || t('money.noCategory') }}</span>
        <span class="font-semibold tabular-nums">{{ book.fmt(r.total) }}</span>
        <span class="w-11 text-right text-xs text-[var(--k-muted)] tabular-nums">{{ ((r.total / sum) * 100).toFixed(0) }}%</span>
      </div>
      <div class="h-2 rounded-r bg-[var(--k-border)]/40">
        <div class="h-full rounded-r" :style="{ width: `${(r.total / max) * 100}%`, background: color }" />
      </div>
    </li>
  </ul>
  <p v-else class="text-sm text-[var(--k-muted)]">{{ t('money.nothing') }}</p>
</template>
