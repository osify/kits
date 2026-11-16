<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import YearBars from '../components/YearBars.vue'
import CategoryBars from '../components/CategoryBars.vue'
import { db } from '../db'
import { byCategory, byMonth, exportCsv, totals, type CategoryTotal, type MonthTotal, type Totals } from '../db/data'
import { useBook } from '../store'

/** Year overview: month-by-month income vs spending, category split, Excel export. */
const { t, locale } = useI18n()
const router = useRouter()
const book = useBook()
const year = ref(new Date().getFullYear())
const months = ref<MonthTotal[]>([])
const cats = ref<CategoryTotal[]>([])
const sum = ref<Totals>({ income: 0, expense: 0, net: 0, count: 0 })

async function load() {
  const [f, to] = [`${year.value}-01-01`, `${year.value}-12-31`]
  ;[months.value, cats.value, sum.value] = await Promise.all([byMonth(db, year.value, book.base), byCategory(db, f, to, book.base), totals(db, f, to, book.base)])
}
watch([year, () => book.version], load, { immediate: true })

const monthName = (key: string) => new Date(key + '-01T00:00:00').toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', { month: 'long' })
const best = computed(() => [...months.value].sort((a, b) => b.income - b.expense - (a.income - a.expense))[0])

async function csv() {
  const text = await exportCsv(db, `${year.value}-01-01`, `${year.value}-12-31`)
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kitroid-income-expense-${year.value}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Button icon="pi pi-chevron-left" text rounded :aria-label="t('money.prevYear')" @click="year--" />
      <h1 class="text-xl font-semibold">{{ year }}</h1>
      <Button icon="pi pi-chevron-right" text rounded :disabled="year >= new Date().getFullYear()" :aria-label="t('money.nextYear')" @click="year++" />
      <span class="flex-1" />
      <Button icon="pi pi-file-excel" :label="t('money.csv')" size="small" outlined @click="csv" />
    </div>

    <section class="grid grid-cols-3 gap-2 sm:gap-3">
      <div class="tile"><div class="k">{{ t('money.income') }}</div><div class="v text-[#2563eb] dark:text-blue-400">{{ book.fmt(sum.income) }}</div></div>
      <div class="tile"><div class="k">{{ t('money.expense') }}</div><div class="v text-amber-700 dark:text-amber-400">{{ book.fmt(sum.expense) }}</div></div>
      <div class="tile"><div class="k">{{ sum.net >= 0 ? t('money.profit') : t('money.loss') }}</div><div class="v" :class="{ 'text-red-600': sum.net < 0 }">{{ book.fmt(sum.net) }}</div></div>
    </section>

    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <h2 class="mb-2 font-semibold">{{ t('money.byMonth') }}</h2>
      <YearBars :year="year" :months="months" @pick="(m) => router.push({ path: '/', query: { m } })" />
      <p v-if="best && best.income - best.expense > 0" class="mt-2 text-sm text-[var(--k-muted)]">
        {{ t('money.bestMonth', { month: monthName(best.month), profit: book.fmt(best.income - best.expense) }) }}
      </p>
      <details class="mt-2 text-sm">
        <summary class="cursor-pointer text-[var(--k-muted)]">{{ t('money.showTable') }}</summary>
        <table class="mt-2 w-full tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr><th class="font-normal">{{ t('money.month') }}</th><th class="text-right font-normal">{{ t('money.income') }}</th><th class="text-right font-normal">{{ t('money.expense') }}</th><th class="text-right font-normal">{{ t('money.profit') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in months" :key="m.month" class="border-t border-[var(--k-border)]">
              <td class="py-1">{{ monthName(m.month) }}</td>
              <td class="text-right">{{ book.fmt(m.income) }}</td>
              <td class="text-right">{{ book.fmt(m.expense) }}</td>
              <td class="text-right font-semibold" :class="{ 'text-red-600': m.income < m.expense }">{{ book.fmt(m.income - m.expense) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <h2 class="mb-3 font-semibold">{{ t('money.whereFrom') }}</h2>
        <CategoryBars :rows="cats" kind="IN" />
      </section>
      <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <h2 class="mb-3 font-semibold">{{ t('money.whereSpent') }}</h2>
        <CategoryBars :rows="cats" kind="OUT" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.tile {
  border: 1px solid var(--k-border);
  background: var(--k-surface);
  border-radius: 0.75rem;
  padding: 0.75rem;
}
.k {
  font-size: 0.8rem;
  color: var(--k-muted);
}
.v {
  font-weight: 700;
  font-size: clamp(0.95rem, 3.6vw, 1.5rem);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
</style>
