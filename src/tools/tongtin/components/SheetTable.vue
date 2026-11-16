<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { sheet, sheetCsv } from '../rules'
import type { CircleDetail } from '../db/data'
import { formatMoney } from '@/core/util/money'

/**
 * Excel-like grid: one row per hand, one column per round. A cell shows what that hand paid in
 * that round (amber = not paid yet, tap to mark paid) or the pot it took (green).
 */
const props = defineProps<{ d: CircleDetail; slug: string }>()
const emit = defineEmits<{ toggle: [roundId: string, memberId: string, amount: number, paid: boolean] }>()
const { t } = useI18n()
const c = computed(() => props.d.circle)
const s = computed(() => sheet(c.value, props.d.members, props.d.rounds, props.d.payments))
const short = (v: number) => formatMoney(v, c.value.currency).replace(' ៛', '')
const nameOf = (id: string) => props.d.members.find((x) => x.id === id)?.name ?? '?'
const totals = computed(() => ({
  paid: s.value.rows.reduce((a, r) => a + r.paid, 0),
  owing: s.value.rows.reduce((a, r) => a + Math.max(0, r.owing), 0),
  received: s.value.rows.reduce((a, r) => a + r.received, 0),
}))

function exportCsv() {
  const csv = sheetCsv(s.value, c.value.currency, {
    hand: t('tt.name'), round: t('tt.roundCol'), paid: t('tt.paidTotal'), owing: t('tt.owing'), received: t('tt.receivedCol'),
    net: t('tt.net'), won: t('tt.wonCell'), unpaid: t('tt.unpaidCell'), pot: t('tt.pot'), bid: t('tt.bidRow'),
  })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `tongtin-${props.slug}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-3 text-xs text-[var(--k-muted)]">
      <span class="inline-flex items-center gap-1"><span class="size-3 rounded-sm bg-primary-100 ring-1 ring-primary-400 dark:bg-primary-900" />{{ t('tt.legendWon') }}</span>
      <span class="inline-flex items-center gap-1"><span class="size-3 rounded-sm ring-1 ring-[var(--k-border)]" />{{ t('tt.legendPaid') }}</span>
      <span class="inline-flex items-center gap-1"><span class="size-3 rounded-sm bg-amber-100 ring-1 ring-amber-400 dark:bg-amber-950" />{{ t('tt.legendUnpaid') }}</span>
      <span class="flex-1" />
      <Button :label="t('tt.excel')" icon="pi pi-file-excel" size="small" outlined @click="exportCsv" />
    </div>
    <p v-if="!s.rounds.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('tt.noRounds') }}</p>
    <div v-else class="max-h-[70vh] overflow-auto rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <table class="border-separate border-spacing-0 text-xs whitespace-nowrap tabular-nums">
        <thead class="sticky top-0 z-10 bg-[var(--k-surface)]">
          <tr>
            <th class="sticky left-0 z-20 border-b border-r border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1.5 text-left">{{ t('tt.name') }}</th>
            <th v-for="r in s.rounds" :key="r.no" class="border-b border-[var(--k-border)] px-2 py-1.5 text-right font-semibold">
              {{ t('tt.roundCol') }} {{ r.no }}
              <span class="block font-normal text-[var(--k-muted)]">{{ r.date.slice(2) }}</span>
            </th>
            <th class="border-b border-l border-[var(--k-border)] px-2 py-1.5 text-right">{{ t('tt.paidTotal') }}</th>
            <th class="border-b border-[var(--k-border)] px-2 py-1.5 text-right">{{ t('tt.owing') }}</th>
            <th class="border-b border-[var(--k-border)] px-2 py-1.5 text-right">{{ t('tt.receivedCol') }}</th>
            <th class="border-b border-[var(--k-border)] px-2 py-1.5 text-right">{{ t('tt.net') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in s.rows" :key="row.id" class="hover:bg-[var(--k-border)]/30">
            <th class="sticky left-0 z-[5] max-w-40 truncate border-r border-b border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-left font-semibold">
              <span class="mr-1 font-normal text-[var(--k-muted)]">{{ i + 1 }}</span>{{ row.name }}
            </th>
            <td v-for="(cell, j) in row.cells" :key="j" class="border-b border-[var(--k-border)] p-0.5 text-right">
              <span v-if="cell.kind === 'won'" class="block rounded bg-primary-100 px-1.5 py-1 font-semibold text-primary-800 dark:bg-primary-900 dark:text-primary-100" :title="t('tt.wonCell')">
                +{{ short(cell.amount) }}
              </span>
              <button
                v-else-if="cell.kind === 'pay'"
                type="button"
                class="block w-full rounded px-1.5 py-1 text-right"
                :class="cell.paid ? 'hover:bg-[var(--k-border)]/60' : 'bg-amber-100 font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900'"
                :aria-pressed="cell.paid"
                :title="cell.paid ? t('tt.paid') : t('tt.markPaid')"
                @click="emit('toggle', s.rounds[j].id!, row.id, cell.amount, !cell.paid)"
              >
                {{ short(cell.amount) }}
              </button>
            </td>
            <td class="border-b border-l border-[var(--k-border)] px-2 py-1 text-right">{{ short(row.paid) }}</td>
            <td class="border-b border-[var(--k-border)] px-2 py-1 text-right" :class="row.owing > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-[var(--k-muted)]'">
              {{ row.owing > 0 ? short(row.owing) : '—' }}
            </td>
            <td class="border-b border-[var(--k-border)] px-2 py-1 text-right">{{ row.received ? short(row.received) : '—' }}</td>
            <td class="border-b border-[var(--k-border)] px-2 py-1 text-right font-semibold">{{ short(row.net) }}</td>
          </tr>
        </tbody>
        <tfoot class="sticky bottom-0 bg-[var(--k-surface)] font-semibold">
          <tr>
            <th class="sticky left-0 border-r border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-left">{{ t('tt.winner') }}</th>
            <td v-for="r in s.rounds" :key="r.no" class="max-w-24 truncate px-2 py-1 text-right font-normal">{{ nameOf(r.winner_id) }}</td>
            <td class="border-l border-[var(--k-border)]" colspan="4" />
          </tr>
          <tr>
            <th class="sticky left-0 border-r border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-left">{{ t('tt.bidRow') }}</th>
            <td v-for="r in s.rounds" :key="r.no" class="px-2 py-1 text-right font-normal">{{ r.bid ? short(r.bid) : '—' }}</td>
            <td class="border-l border-[var(--k-border)]" colspan="4" />
          </tr>
          <tr>
            <th class="sticky left-0 border-r border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-left">{{ t('tt.pot') }}</th>
            <td v-for="r in s.rounds" :key="r.no" class="px-2 py-1 text-right">{{ short(r.pot) }}</td>
            <td class="border-l border-[var(--k-border)] px-2 py-1 text-right">{{ short(totals.paid) }}</td>
            <td class="px-2 py-1 text-right text-amber-700 dark:text-amber-400">{{ totals.owing ? short(totals.owing) : '—' }}</td>
            <td class="px-2 py-1 text-right">{{ short(totals.received) }}</td>
            <td />
          </tr>
          <tr>
            <th class="sticky left-0 border-t border-r border-[var(--k-border)] bg-[var(--k-surface)] px-2 py-1 text-left">{{ t('tt.collectedRow') }}</th>
            <td v-for="r in s.rounds" :key="r.no" class="border-t border-[var(--k-border)] px-2 py-1 text-right" :class="r.collected < r.pot ? 'text-amber-700 dark:text-amber-400' : 'text-primary-700 dark:text-primary-400'">
              {{ short(r.collected) }}
            </td>
            <td class="border-t border-l border-[var(--k-border)]" colspan="4" />
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-[var(--k-muted)]">{{ t('tt.sheetHint', { cur: c.currency === 'KHR' ? '៛' : '$' }) }}</p>
  </div>
</template>
