<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { fromMin, lanes, toMin } from '../schedule'

/**
 * Time grid for the schedule: one column per doctor, room or day; time runs down. Tap an empty
 * place to book at that time (snapped to `step`), tap a block to open it. Hours outside a
 * column's working ranges are shaded.
 */
export interface GridColumn {
  key: string
  label: string
  sub?: string
  color?: string
  work?: [string, string][] | null // working ranges; null/undefined = no shading
  today?: boolean
}
export interface GridItem {
  id: string
  col: string
  start: string
  minutes: number
  title: string
  sub?: string
  color: string
  state: 'booked' | 'waiting' | 'done' | 'missed'
}
const props = withDefaults(defineProps<{ columns: GridColumn[]; items: GridItem[]; from: number; to: number; step?: number; now?: number | null }>(), { step: 15, now: null })
const emit = defineEmits<{ pick: [col: string, start: string]; open: [id: string] }>()

const PX = 1.2 // pixels per minute: 1 hour = 72 px
const height = computed(() => (props.to - props.from) * PX)
const hours = computed(() => {
  const out: number[] = []
  for (let m = props.from; m < props.to; m += 60) out.push(m)
  return out
})
const placed = computed(() => {
  const by: Record<string, { item: GridItem; lane: number; of: number }[]> = {}
  for (const c of props.columns) by[c.key] = lanes(props.items.filter((i) => i.col === c.key))
  return by
})
/** Shaded gaps outside the working ranges. */
function gaps(c: GridColumn): [number, number][] {
  if (!c.work) return []
  const out: [number, number][] = []
  let at = props.from
  for (const [a, b] of c.work) {
    if (toMin(a) > at) out.push([at, Math.min(toMin(a), props.to)])
    at = Math.max(at, toMin(b))
  }
  if (at < props.to) out.push([at, props.to])
  return out
}
function pick(c: GridColumn, e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const m = props.from + Math.floor((e.clientY - rect.top) / PX / props.step) * props.step
  emit('pick', c.key, fromMin(Math.max(props.from, Math.min(props.to - props.step, m))))
}
const anyToday = computed(() => props.columns.some((c) => c.today))
/** Open at the current time (or the first booking), an hour above it. */
const box = ref<HTMLElement | null>(null)
async function scrollToFocus() {
  await nextTick()
  const first = props.items.length ? Math.min(...props.items.map((i) => toMin(i.start))) : null
  const at = props.now !== null && props.now > props.from && props.now < props.to ? props.now : first
  if (box.value && at !== null) box.value.scrollTop = Math.max(0, (at - props.from - 60) * PX)
}
onMounted(scrollToFocus)
watch(() => [props.from, props.columns.map((c) => c.key).join()], scrollToFocus)
const top = (start: string) => (toMin(start) - props.from) * PX
</script>

<template>
  <div ref="box" class="tg max-h-[72vh] overflow-auto rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
    <div class="grid min-w-full" :style="{ gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(8.5rem, 1fr))` }">
      <!-- header -->
      <div class="tg-head sticky left-0 top-0 z-30 border-b border-[var(--k-border)] bg-[var(--k-surface)]" />
      <div
        v-for="c in columns"
        :key="'h' + c.key"
        class="tg-head sticky top-0 z-20 min-w-0 border-b border-l border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1.5"
        :class="{ 'bg-primary-50 dark:bg-primary-950': c.today }"
      >
        <div class="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span v-if="c.color" class="size-2.5 shrink-0 rounded-full" :style="{ background: c.color }" />{{ c.label }}
        </div>
        <div v-if="c.sub" class="truncate text-[11px] text-[var(--k-muted)]">{{ c.sub }}</div>
      </div>

      <!-- time gutter -->
      <div class="sticky left-0 z-10 bg-[var(--k-surface)]" :style="{ height: height + 'px' }">
        <div v-for="h in hours" :key="h" class="relative text-right text-[11px] tabular-nums text-[var(--k-muted)]" :style="{ height: 60 * PX + 'px' }">
          <span class="absolute -top-2 right-1.5">{{ h === from ? '' : fromMin(h) }}</span>
        </div>
      </div>

      <!-- columns -->
      <div
        v-for="c in columns"
        :key="'c' + c.key"
        class="tg-col relative cursor-pointer border-l border-[var(--k-border)]"
        :style="{ height: height + 'px', '--hour': 60 * PX + 'px' }"
        @click.self="pick(c, $event)"
      >
        <div v-for="([a, b], i) in gaps(c)" :key="'g' + i" class="tg-off pointer-events-none absolute inset-x-0" :style="{ top: (a - from) * PX + 'px', height: (b - a) * PX + 'px' }" />
        <div v-if="now !== null && (c.today || !anyToday) && now >= from && now <= to" class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" :style="{ top: (now - from) * PX + 'px' }" />
        <button
          v-for="p in placed[c.key]"
          :key="p.item.id"
          type="button"
          class="tg-item absolute z-[5] overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs leading-tight"
          :class="`is-${p.item.state}`"
          :style="{
            top: top(p.item.start) + 1 + 'px',
            height: Math.max(p.item.minutes * PX - 2, 16) + 'px',
            left: `calc(${(100 / p.of) * p.lane}% + 2px)`,
            width: `calc(${100 / p.of}% - 4px)`,
            '--c': p.item.color,
          }"
          @click.stop="emit('open', p.item.id)"
        >
          <span class="block truncate font-semibold">
            <i v-if="p.item.state === 'waiting'" class="pi pi-clock mr-0.5 text-[10px]" />
            <i v-else-if="p.item.state === 'done'" class="pi pi-check mr-0.5 text-[10px]" />
            <span class="tabular-nums">{{ p.item.start }}</span> {{ p.item.title }}
          </span>
          <span v-if="p.item.sub && p.item.minutes >= 25" class="block truncate opacity-80">{{ p.item.sub }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tg-col {
  background-image:
    linear-gradient(to bottom, var(--k-border) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--k-border) 45%, transparent) 1px, transparent 1px);
  background-size: 100% var(--hour), 100% calc(var(--hour) / 2);
}
.tg-col:hover {
  background-color: color-mix(in srgb, var(--k-border) 18%, transparent);
}
.tg-off {
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--k-muted) 10%, transparent) 0 6px, transparent 6px 12px);
}
.tg-item {
  background: color-mix(in srgb, var(--c) 16%, var(--k-surface));
  border-left: 3px solid var(--c);
  color: var(--k-text, inherit);
}
.tg-item:hover {
  background: color-mix(in srgb, var(--c) 26%, var(--k-surface));
}
.tg-item.is-waiting {
  box-shadow: inset 0 0 0 1.5px #d97706;
}
.tg-item.is-done {
  opacity: 0.6;
}
.tg-item.is-missed {
  opacity: 0.45;
  text-decoration: line-through;
}
</style>
