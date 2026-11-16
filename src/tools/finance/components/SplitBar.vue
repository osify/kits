<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Part-to-whole bar (e.g. principal vs interest of everything you repay).
 * Two categorical hues validated for light/dark and colour-blind readers
 * (#2563eb / #d97706, CVD ΔE 32). Legend + direct labels; a 2px gap separates the segments;
 * hovering or focusing a segment shows its value.
 */
const props = defineProps<{ parts: { label: string; value: number; text: string }[]; label: string }>()
const COLORS = ['#2563eb', '#d97706']
const total = computed(() => props.parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1)
const pct = (v: number) => (Math.max(0, v) / total.value) * 100
const hover = ref<number | null>(null)
</script>

<template>
  <figure class="flex flex-col gap-2" :aria-label="label">
    <div class="flex h-6 w-full gap-[2px] overflow-hidden rounded" role="img" :aria-label="parts.map((p) => `${p.label} ${p.text}`).join(', ')">
      <div
        v-for="(p, i) in parts"
        :key="p.label"
        class="h-full first:rounded-l last:rounded-r"
        :class="{ 'opacity-60': hover != null && hover !== i }"
        :style="{ width: `${pct(p.value)}%`, background: COLORS[i % COLORS.length] }"
        tabindex="0"
        :title="`${p.label}: ${p.text} (${pct(p.value).toFixed(1)}%)`"
        @mouseenter="hover = i"
        @mouseleave="hover = null"
        @focus="hover = i"
        @blur="hover = null"
      />
    </div>
    <figcaption class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <span v-for="(p, i) in parts" :key="p.label" class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-sm" :style="{ background: COLORS[i % COLORS.length] }" />
        <span>{{ p.label }}</span>
        <span class="font-semibold tabular-nums">{{ p.text }}</span>
        <span class="text-[var(--k-muted)]">({{ pct(p.value).toFixed(1) }}%)</span>
      </span>
    </figcaption>
  </figure>
</template>
