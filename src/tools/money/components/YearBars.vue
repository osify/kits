<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBook } from '../store'
import type { MonthTotal } from '../db/data'

/**
 * Income vs spending for each month of a year: grouped bars, two series with validated
 * categorical hues (blue #2563eb / amber #d97706, CVD ΔE 32), legend above, one shared axis,
 * 4px rounded tops on the baseline, 2px gap between the pair, hover/focus tooltip per month.
 */
const props = defineProps<{ year: number; months: MonthTotal[] }>()
const emit = defineEmits<{ pick: [month: string] }>()
const { t, locale } = useI18n()
const book = useBook()
const hover = ref<number | null>(null)

const data = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const key = `${props.year}-${String(i + 1).padStart(2, '0')}`
    const m = props.months.find((x) => x.month === key)
    return { key, income: m?.income ?? 0, expense: m?.expense ?? 0 }
  }),
)
const W = 640
const H = 220
const PB = 22
const max = computed(() => {
  const m = Math.max(1, ...data.value.flatMap((d) => [d.income, d.expense]))
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= m) ?? m
})
const slot = W / 12
const bw = Math.min(16, slot / 2 - 4)
const y = (v: number) => (H - PB) * (1 - v / max.value)
function bar(x: number, v: number) {
  const top = y(v)
  const base = H - PB
  const h = base - top
  if (h <= 0.5) return ''
  const r = Math.min(4, bw / 2, h)
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`
}
const monthLabel = (i: number) => new Date(props.year, i, 1).toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', { month: 'short' })
const tip = computed(() => (hover.value == null ? null : data.value[hover.value]))
</script>

<template>
  <figure class="relative">
    <figcaption class="mb-2 flex gap-4 text-sm">
      <span class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm bg-[#2563eb]" />{{ t('money.income') }}</span>
      <span class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm bg-[#d97706]" />{{ t('money.expense') }}</span>
    </figcaption>
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto max-h-72 w-full" role="img" :aria-label="t('money.yearChart', { year })" @mouseleave="hover = null">
      <line v-for="f in [0.5, 1]" :key="f" x1="0" :x2="W" :y1="y(f * max)" :y2="y(f * max)" class="grid" />
      <g v-for="(d, i) in data" :key="d.key">
        <rect
          :x="i * slot"
          y="0"
          :width="slot"
          :height="H - PB"
          fill="transparent"
          class="cursor-pointer"
          tabindex="0"
          :aria-label="`${monthLabel(i)}: ${t('money.income')} ${book.fmt(d.income)}, ${t('money.expense')} ${book.fmt(d.expense)}`"
          @mouseenter="hover = i"
          @focus="hover = i"
          @blur="hover = null"
          @click="emit('pick', d.key)"
          @keydown.enter="emit('pick', d.key)"
        />
        <path :d="bar(i * slot + slot / 2 - bw - 1, d.income)" fill="#2563eb" :opacity="hover != null && hover !== i ? 0.45 : 1" />
        <path :d="bar(i * slot + slot / 2 + 1, d.expense)" fill="#d97706" :opacity="hover != null && hover !== i ? 0.45 : 1" />
        <text :x="i * slot + slot / 2" :y="H - 6" text-anchor="middle" class="axis">{{ monthLabel(i) }}</text>
      </g>
      <line x1="0" :x2="W" :y1="H - PB" :y2="H - PB" class="base" />
    </svg>
    <div
      v-if="tip"
      class="pointer-events-none absolute top-8 -translate-x-1/2 rounded-lg border border-[var(--k-border)] bg-[var(--k-surface)] px-3 py-2 text-xs shadow-md"
      :style="{ left: `clamp(5rem, ${((hover! + 0.5) / 12) * 100}%, calc(100% - 5rem))` }"
    >
      <div class="font-semibold">{{ monthLabel(hover!) }} {{ year }}</div>
      <div>{{ t('money.income') }}: {{ book.fmt(tip.income) }}</div>
      <div>{{ t('money.expense') }}: {{ book.fmt(tip.expense) }}</div>
      <div class="font-semibold">{{ t('money.profit') }}: {{ book.fmt(tip.income - tip.expense) }}</div>
    </div>
  </figure>
</template>

<style scoped>
.grid {
  stroke: var(--k-border);
}
.base {
  stroke: var(--k-muted);
}
.axis {
  fill: var(--k-muted);
  font-size: 11px;
}
rect:focus {
  outline: none;
}
</style>
