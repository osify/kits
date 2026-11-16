<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Level } from '../rules'

/** Reading status: icon + word, never colour alone. */
defineProps<{ level: Level | null }>()
const { t } = useI18n()
const STYLE: Record<Level, { cls: string; icon: string }> = {
  low: { cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', icon: 'pi-arrow-down' },
  normal: { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', icon: 'pi-check' },
  elevated: { cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200', icon: 'pi-arrow-up' },
  high: { cls: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200', icon: 'pi-exclamation-triangle' },
  veryHigh: { cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', icon: 'pi-exclamation-circle' },
}
</script>

<template>
  <span v-if="level" class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="STYLE[level].cls">
    <i class="pi text-[10px]" :class="STYLE[level].icon" />{{ t(`hl.level.${level}`) }}
  </span>
</template>
