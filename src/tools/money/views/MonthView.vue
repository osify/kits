<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import TxnDialog from '../components/TxnDialog.vue'
import CategoryBars from '../components/CategoryBars.vue'
import { db } from '../db'
import { byCategory, listTxns, totals, type CategoryTotal, type Totals, type TxnKind, type TxnRow } from '../db/data'
import { useBook, catName } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** One month of money in and out: totals, balances, category split and every transaction. */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const book = useBook()

const month = computed(() => (route.query.m as string) || today().slice(0, 7))
const range = computed<[string, string]>(() => {
  const [y, m] = month.value.split('-').map(Number)
  return [`${month.value}-01`, today(new Date(y, m, 0))]
})
const label = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', { month: 'long', year: 'numeric' })
})
function shift(k: number) {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + k, 1)
  router.replace({ query: { ...route.query, m: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` } })
}
const isCurrent = computed(() => month.value === today().slice(0, 7))

const account = ref<string | null>(null)
const search = ref('')
const rows = ref<TxnRow[]>([])
const sum = ref<Totals>({ income: 0, expense: 0, net: 0, count: 0 })
const cats = ref<CategoryTotal[]>([])

async function load() {
  const [f, to] = range.value
  ;[rows.value, sum.value, cats.value] = await Promise.all([
    listTxns(db, f, to, { accountId: account.value ?? undefined, search: search.value }),
    totals(db, f, to, book.base),
    byCategory(db, f, to, book.base),
  ])
}
watch([range, account, search, () => book.version], load, { immediate: true })

const groups = computed(() => {
  const m = new Map<string, TxnRow[]>()
  for (const r of rows.value) m.set(r.date, [...(m.get(r.date) ?? []), r])
  return [...m.entries()]
})
const accountOptions = computed(() => [{ label: t('money.allAccounts'), value: null }, ...book.accounts.map((a) => ({ label: a.name, value: a.id }))])

const dlgOpen = ref(false)
const editing = ref<TxnRow | null>(null)
const newKind = ref<TxnKind>('OUT')
function add(kind: TxnKind) {
  editing.value = null
  newKind.value = kind
  dlgOpen.value = true
}
function edit(r: TxnRow) {
  editing.value = r
  dlgOpen.value = true
}
defineExpose({ add })

const amt = (r: TxnRow) => formatMoney(r.amount, r.account_currency)
const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale.value === 'km' ? 'km-KH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Button icon="pi pi-chevron-left" text rounded :aria-label="t('money.prevMonth')" @click="shift(-1)" />
      <h1 class="min-w-0 flex-1 text-center text-xl font-semibold">{{ label }}</h1>
      <Button icon="pi pi-chevron-right" text rounded :disabled="isCurrent" :aria-label="t('money.nextMonth')" @click="shift(1)" />
    </div>

    <section class="grid grid-cols-3 gap-2 sm:gap-3">
      <div class="tile"><div class="k">{{ t('money.income') }}</div><div class="v text-[#2563eb] dark:text-blue-400">{{ book.fmt(sum.income) }}</div></div>
      <div class="tile"><div class="k">{{ t('money.expense') }}</div><div class="v text-amber-700 dark:text-amber-400">{{ book.fmt(sum.expense) }}</div></div>
      <div class="tile">
        <div class="k">{{ sum.net >= 0 ? t('money.profit') : t('money.loss') }}</div>
        <div class="v" :class="sum.net < 0 ? 'text-red-600' : ''">{{ book.fmt(sum.net) }}</div>
      </div>
    </section>

    <div class="grid grid-cols-2 gap-2">
      <Button :label="t('money.kind.IN')" icon="pi pi-arrow-down-left" severity="info" @click="add('IN')" />
      <Button :label="t('money.kind.OUT')" icon="pi pi-arrow-up-right" severity="warn" @click="add('OUT')" />
    </div>

    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center">
        <h2 class="flex-1 font-semibold">{{ t('money.balances') }}</h2>
        <span class="text-sm text-[var(--k-muted)]">{{ t('money.total') }} <b class="text-[var(--k-text)]">{{ book.fmt(book.totalBalance) }}</b></span>
      </div>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="a in book.activeAccounts" :key="a.id" class="flex items-center gap-2 rounded-lg bg-[var(--k-border)]/30 px-3 py-2">
          <i :class="{ CASH: 'pi pi-money-bill', BANK: 'pi pi-building-columns', WALLET: 'pi pi-mobile', OTHER: 'pi pi-wallet' }[a.kind]" class="text-[var(--k-muted)]" />
          <span class="min-w-0 flex-1 truncate">{{ a.name }}</span>
          <span class="font-semibold tabular-nums" :class="{ 'text-red-600': a.balance < 0 }">{{ formatMoney(a.balance, a.currency) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="cats.some((c) => c.kind === 'OUT')" class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <h2 class="mb-3 font-semibold">{{ t('money.whereSpent') }}</h2>
      <CategoryBars :rows="cats" kind="OUT" />
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-auto font-semibold">{{ t('money.transactions', { n: rows.length }) }}</h2>
        <Select v-model="account" :options="accountOptions" option-label="label" option-value="value" :placeholder="t('money.allAccounts')" size="small" class="min-w-40" />
        <InputText v-model="search" :placeholder="t('money.search')" size="small" class="w-40" />
      </div>
      <p v-if="!rows.length" class="rounded-xl border border-dashed border-[var(--k-border)] py-10 text-center text-[var(--k-muted)]">{{ t('money.empty') }}</p>
      <div v-for="[date, list] in groups" :key="date" class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <div class="border-b border-[var(--k-border)] px-4 py-1.5 text-xs text-[var(--k-muted)]">{{ dayLabel(date) }}</div>
        <ul class="divide-y divide-[var(--k-border)]">
          <li v-for="r in list" :key="r.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--k-border)]/30" @click="edit(r)">
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--k-border)]/50 text-lg" aria-hidden="true">
                {{ r.kind === 'MOVE' ? '⇄' : r.category_icon || (r.kind === 'IN' ? '➕' : '➖') }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate">
                  {{ r.kind === 'MOVE' ? `${r.account_name} → ${r.to_account_name}` : catName({ name: r.category_name, name_km: r.category_name_km }, locale) || t('money.noCategory') }}
                </span>
                <span class="block truncate text-xs text-[var(--k-muted)]">
                  <template v-if="r.kind !== 'MOVE'">{{ r.account_name }}</template><template v-if="r.note"> · {{ r.note }}</template>
                  <i v-if="r.photo" class="pi pi-image ml-1" :aria-label="t('money.photo')" />
                </span>
              </span>
              <span
                class="font-semibold tabular-nums"
                :class="r.kind === 'IN' ? 'text-[#2563eb] dark:text-blue-400' : r.kind === 'OUT' ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--k-muted)]'"
              >
                {{ r.kind === 'IN' ? '+' : r.kind === 'OUT' ? '−' : '' }}{{ amt(r) }}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <TxnDialog v-model:visible="dlgOpen" :txn="editing" :kind="newKind" @saved="book.load()" />
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
