<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Small time-series line chart (inline SVG). One series = one hue (#059669); two series use
 * the validated blue/amber pair (#2563eb / #d97706), always with a legend, so identity is never
 * colour alone. 2px lines, ≥8px markers, recessive grid, optional dashed reference lines,
 * crosshair + tooltip on hover/touch. The list under the chart is the table view.
 */
export interface Series {
  label: string
  points: { t: number; v: number }[]
}
const props = defineProps<{ series: Series[]; refs?: { v: number; label: string }[]; unit?: string; decimals?: number }>()
const COLORS = computed(() => (props.series.length === 1 ? ['#059669'] : ['#2563eb', '#d97706']))
const W = 640
const H = 220
const P = { l: 40, r: 12, t: 12, b: 26 }
const hover = ref<number | null>(null)

const all = computed(() => props.series.flatMap((s) => s.points))
const tMin = computed(() => Math.min(...all.value.map((p) => p.t)))
const tMax = computed(() => Math.max(...all.value.map((p) => p.t)))
const vRange = computed(() => {
  const vs = [...all.value.map((p) => p.v), ...(props.refs ?? []).map((r) => r.v)]
  let lo = Math.min(...vs)
  let hi = Math.max(...vs)
  const pad = (hi - lo) * 0.12 || Math.max(1, Math.abs(hi) * 0.05)
  lo -= pad
  hi += pad
  return { lo, hi }
})
const x = (t: number) => (tMax.value === tMin.value ? (P.l + W - P.r) / 2 : P.l + ((t - tMin.value) / (tMax.value - tMin.value)) * (W - P.l - P.r))
const y = (v: number) => P.t + (1 - (v - vRange.value.lo) / (vRange.value.hi - vRange.value.lo)) * (H - P.t - P.b)
const ticks = computed(() => {
  const { lo, hi } = vRange.value
  const step = niceStep((hi - lo) / 4)
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v * 100) / 100)
  return out
})
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p
}
const paths = computed(() => props.series.map((s) => [...s.points].sort((a, b) => a.t - b.t).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')))
const times = computed(() => [...new Set(all.value.map((p) => p.t))].sort((a, b) => a - b))
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const fmtV = (v: number) => v.toFixed(props.decimals ?? 0)
const xTicks = computed(() => {
  const ts = times.value
  if (ts.length <= 1) return ts
  const n = Math.min(5, ts.length)
  return Array.from({ length: n }, (_, i) => ts[Math.round((i * (ts.length - 1)) / (n - 1))])
})
function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const r = svg.getBoundingClientRect()
  const px = ((e.clientX - r.left) / r.width) * W
  let best = 0
  let bd = Infinity
  times.value.forEach((t, i) => {
    const d = Math.abs(x(t) - px)
    if (d < bd) (bd = d), (best = i)
  })
  hover.value = best
}
const hoverT = computed(() => (hover.value === null ? null : times.value[hover.value]))
const hoverVals = computed(() => (hoverT.value === null ? [] : props.series.map((s) => s.points.find((p) => p.t === hoverT.value)?.v ?? null)))
</script>

<template>
  <div class="relative">
    <div v-if="series.length > 1" class="mb-1 flex gap-4 text-xs text-[var(--k-muted)]">
      <span v-for="(s, i) in series" :key="s.label" class="inline-flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 rounded" :style="{ background: COLORS[i] }" />{{ s.label }}
      </span>
    </div>
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="h-auto w-full touch-none select-none"
      role="img"
      :aria-label="series.map((s) => s.label).join(', ')"
      @pointermove="onMove"
      @pointerdown="onMove"
      @pointerleave="hover = null"
    >
      <g class="text-[var(--k-muted)]" fill="currentColor" font-size="11">
        <template v-for="v in ticks" :key="v">
          <line :x1="P.l" :x2="W - P.r" :y1="y(v)" :y2="y(v)" stroke="currentColor" stroke-opacity="0.15" />
          <text :x="P.l - 6" :y="y(v) + 4" text-anchor="end">{{ v }}</text>
        </template>
        <text
          v-for="(tk, i) in xTicks"
          :key="tk"
          :x="x(tk)"
          :y="H - 6"
          :text-anchor="xTicks.length > 1 && i === 0 ? 'start' : xTicks.length > 1 && i === xTicks.length - 1 ? 'end' : 'middle'"
        >
          {{ fmtDate(tk) }}
        </text>
      </g>
      <g v-for="r in refs ?? []" :key="r.label">
        <line :x1="P.l" :x2="W - P.r" :y1="y(r.v)" :y2="y(r.v)" stroke="currentColor" class="text-[var(--k-muted)]" stroke-dasharray="4 4" stroke-opacity="0.6" />
        <text :x="W - P.r" :y="y(r.v) - 4" text-anchor="end" font-size="10" class="fill-[var(--k-muted)]">{{ r.label }}</text>
      </g>
      <line v-if="hoverT !== null" :x1="x(hoverT)" :x2="x(hoverT)" :y1="P.t" :y2="H - P.b" stroke="currentColor" class="text-[var(--k-muted)]" stroke-opacity="0.5" />
      <g v-for="(s, i) in series" :key="s.label">
        <path :d="paths[i]" fill="none" :stroke="COLORS[i]" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle
          v-for="p in s.points"
          :key="p.t"
          :cx="x(p.t)"
          :cy="y(p.v)"
          :r="hoverT === p.t ? 5.5 : 4"
          :fill="COLORS[i]"
          stroke="var(--k-surface)"
          stroke-width="2"
        />
      </g>
    </svg>
    <div
      v-if="hoverT !== null"
      class="pointer-events-none absolute top-6 rounded-lg border border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-xs shadow"
      :style="{ left: `min(calc(${(x(hoverT) / W) * 100}% + 8px), calc(100% - 9rem))` }"
    >
      <div class="text-[var(--k-muted)]">{{ new Date(hoverT).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}</div>
      <div v-for="(s, i) in series" :key="s.label" class="flex items-center gap-1.5">
        <span class="inline-block size-2 rounded-full" :style="{ background: COLORS[i] }" />
        <span class="text-[var(--k-muted)]">{{ s.label }}</span>
        <b class="tabular-nums">{{ hoverVals[i] === null ? '—' : fmtV(hoverVals[i]!) }}</b><span v-if="unit" class="text-[var(--k-muted)]">{{ unit }}</span>
      </div>
    </div>
  </div>
</template>
