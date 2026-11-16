<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { limitFor, plan } from '@/core/license'
import { useCatalogStore } from '../stores/catalog'

/** "23 / 50 items on sale" meter for plans with an item limit (hidden on unlimited plans). */
const emit = defineEmits<{ upgrade: [] }>()
const { t } = useI18n()
const cat = useCatalogStore()
const max = computed(() => limitFor('items'))
const used = computed(() => cat.items.filter((i) => i.active).length)
const pct = computed(() => Math.min(100, (used.value / max.value) * 100))
const full = computed(() => used.value >= max.value)
const near = computed(() => !full.value && used.value >= max.value * 0.9)
</script>

<template>
  <div v-if="Number.isFinite(max)" class="mb-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-3">
    <div class="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
      <i v-if="full" class="pi pi-exclamation-triangle text-amber-600" aria-hidden="true" />
      <span class="font-semibold tabular-nums">{{ t('pos.plan.usage', { used, max }) }}</span>
      <span class="text-[var(--k-muted)]">· {{ t(`pos.plan.name.${plan}`) }}</span>
      <span class="flex-1" />
      <button type="button" class="text-primary-600 underline dark:text-primary-400" @click="emit('upgrade')">{{ t('pos.plan.unlimitedCta') }}</button>
    </div>
    <div
      class="h-2 overflow-hidden rounded bg-[var(--k-border)]"
      role="meter"
      :aria-valuenow="used"
      aria-valuemin="0"
      :aria-valuemax="max"
      :aria-label="t('pos.plan.usage', { used, max })"
    >
      <div class="h-full rounded" :class="full || near ? 'bg-amber-600' : 'bg-primary-600'" :style="{ width: `${pct}%` }" />
    </div>
    <p v-if="full" class="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{{ t('pos.plan.limitHow') }}</p>
  </div>
</template>
