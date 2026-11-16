<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShopStore } from '../stores/shop'
import type { DayRow } from '../db/reports'

/**
 * Net sales per day: one series, so one hue (#059669, validated for light and dark
 * surfaces), no legend (the heading names it). Thin bars with rounded tops anchored
 * to the baseline, 2px gaps, recessive grid, per-bar hover/focus tooltip.
 * The table under the chart is the accessible view of the same numbers.
 */
const props = defineProps<{ days: DayRow[]; from: string; to: string }>()
const { t } = useI18n()
const shop = useShopStore()
const hover = ref<number | null>(null)

/** Every calendar day in range (missing days = 0), max 62 bars. */
const series = computed(() => {
  const map = new Map(props.days.map((d) => [d.date, d]))
  const out: { date: string; net: number; sales: number }[] = []
  const d = new Date(props.from + 'T00:00:00')
  const end = new Date(props.to + 'T00:00:00')
  while (d <= end && out.length < 62) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const r = map.get(k)
    out.push({ date: k, net: r?.net ?? 0, sales: r?.sales ?? 0 })
    d.setDate(d.getDate() + 1)
  }
  return out
})

const W = 640
const H = 200
const PAD_L = 8
const PAD_B = 22
const max = computed(() => {
  const m = Math.max(1, ...series.value.map((s) => s.net))
  // nice ceiling: 1, 2, 5 × 10^n
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= m) ?? m
})
const slot = computed(() => (W - PAD_L) / Math.max(1, series.value.length))
const barW = computed(() => Math.max(2, Math.min(28, slot.value - 2)))
const y = (v: number) => (H - PAD_B) * (1 - v / max.value)
const ticks = computed(() => [0, 0.5, 1].map((f) => f * max.value))

function barPath(i: number, v: number) {
  const x = PAD_L + i * slot.value + (slot.value - barW.value) / 2
  const top = y(v)
  const base = H - PAD_B
  const h = base - top
  if (h <= 0) return ''
  const r = Math.min(4, barW.value / 2, h)
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW.value - r} Q${x + barW.value},${top} ${x + barW.value},${top + r} V${base} Z`
}
const labelEvery = computed(() => Math.ceil(series.value.length / 8))
const short = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`
const tip = computed(() => (hover.value == null ? null : series.value[hover.value]))
const tipX = computed(() => (hover.value == null ? 0 : ((PAD_L + hover.value * slot.value + slot.value / 2) / W) * 100))
</script>

<template>
  <figure class="relative">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto max-h-72 w-full" preserveAspectRatio="xMinYMid meet" role="img" :aria-label="t('pos.sum.daily')" @mouseleave="hover = null">
      <g class="grid-lines">
        <line v-for="tk in ticks" :key="tk" :x1="PAD_L" :x2="W" :y1="y(tk)" :y2="y(tk)" />
      </g>
      <g v-for="(s, i) in series" :key="s.date">
        <!-- hit target: the whole column, bigger than the bar -->
        <rect
          :x="PAD_L + i * slot"
          y="0"
          :width="slot"
          :height="H - PAD_B"
          fill="transparent"
          tabindex="0"
          :aria-label="`${s.date}: ${shop.fmt(s.net)}`"
          @mouseenter="hover = i"
          @focus="hover = i"
          @blur="hover = null"
        />
        <path :d="barPath(i, s.net)" class="bar" :class="{ dim: hover != null && hover !== i }" />
        <text v-if="i % labelEvery === 0" :x="PAD_L + i * slot + slot / 2" :y="H - 6" text-anchor="middle" class="axis">{{ short(s.date) }}</text>
      </g>
      <line :x1="PAD_L" :x2="W" :y1="H - PAD_B" :y2="H - PAD_B" class="baseline" />
    </svg>
    <div
      v-if="tip"
      class="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-[var(--k-border)] bg-[var(--k-surface)] px-3 py-2 text-xs shadow-md"
      :style="{ left: `clamp(4rem, ${tipX}%, calc(100% - 4rem))` }"
    >
      <div class="font-semibold">{{ tip.date }}</div>
      <div>{{ shop.fmt(tip.net) }}</div>
      <div class="text-[var(--k-muted)]">{{ t('pos.sum.salesN', { n: tip.sales }) }}</div>
    </div>
    <figcaption class="mt-1 flex justify-between text-xs text-[var(--k-muted)]">
      <span>0</span><span>{{ t('pos.sum.max') }} {{ shop.fmt(max) }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.bar {
  fill: #059669;
  transition: opacity 0.1s;
}
.bar.dim {
  opacity: 0.45;
}
.grid-lines line {
  stroke: var(--k-border);
  stroke-width: 1;
}
.baseline {
  stroke: var(--k-muted);
  stroke-width: 1;
}
.axis {
  fill: var(--k-muted);
  font-size: 11px;
}
rect:focus {
  outline: none;
}
</style>
