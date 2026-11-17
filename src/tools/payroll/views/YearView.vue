<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from 'primevue/select'
import { db } from '../db'
import { yearReport, type YearRow } from '../db/data'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** The year by month: staff, pay, tax on salary, FBT, NSSF, net pay, employer cost. */
const { t } = useI18n()
const thisYear = today().slice(0, 4)
const year = ref(thisYear)
const years = Array.from({ length: 6 }, (_, i) => String(Number(thisYear) - i))
const rows = ref<YearRow[]>([])
const load = async () => (rows.value = await yearReport(db, year.value))
onMounted(load)
watch(year, load)
const m = (v: number) => formatMoney(v, 'KHR')
const sum = (k: keyof YearRow) => rows.value.reduce((s, r) => s + (r[k] as number), 0)
const cols = computed(() => [
  { k: 'gross' as const, label: t('pr.grossPaid') },
  { k: 'tax' as const, label: t('pr.taxShort') },
  { k: 'fbt' as const, label: t('pr.fbtShort') },
  { k: 'nssf' as const, label: 'NSSF' },
  { k: 'net' as const, label: t('fin.tax.net') },
  { k: 'cost' as const, label: t('fin.tax.employerCost') },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('pr.nav.year') }}</h1>
      <Select v-model="year" :options="years" class="w-28" />
    </div>
    <p v-if="!rows.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('pr.noYear') }}</p>
    <section v-else class="card overflow-x-auto">
      <table class="w-full min-w-[44rem] text-sm tabular-nums">
        <thead class="text-left text-[var(--k-muted)]">
          <tr>
            <th class="py-1 font-normal">{{ t('pr.month') }}</th>
            <th class="py-1 text-right font-normal">{{ t('pr.nav.staff') }}</th>
            <th v-for="c in cols" :key="c.k" class="py-1 text-right font-normal">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.month" class="border-t border-[var(--k-border)]">
            <td class="py-1.5">
              <RouterLink :to="`/m/${r.month}`" class="font-semibold underline">{{ r.month }}</RouterLink>
              <i v-if="r.status === 'CLOSED'" class="pi pi-lock ml-1 text-xs text-[var(--k-muted)]" :aria-label="t('pr.closed')" />
            </td>
            <td class="text-right">{{ r.staff }}</td>
            <td v-for="c in cols" :key="c.k" class="text-right">{{ m(r[c.k]) }}</td>
          </tr>
          <tr class="border-t-2 border-[var(--k-border)] font-semibold">
            <td class="py-1.5">{{ year }}</td>
            <td />
            <td v-for="c in cols" :key="c.k" class="text-right">{{ m(sum(c.k)) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
