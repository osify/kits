<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import StateTag from '../components/StateTag.vue'
import { db } from '../db'
import { createDoc, listDocs, outstanding, type DocKind, type DocRow, type DocState } from '../db/data'
import { useInvoice } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** Invoices or quotes: what is still owed, filters, search, and a new document button. */
const props = defineProps<{ kind: DocKind }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const iv = useInvoice()
const todayStr = today()
const rows = ref<DocRow[]>([])
const search = ref('')
const clientId = computed(() => (route.query.client as string) || '')
type Filter = DocState | 'open' | ''
const filter = ref<Filter>(props.kind === 'INVOICE' ? ((route.query.f as Filter) ?? '') : '')
const owed = ref<Awaited<ReturnType<typeof outstanding>> | null>(null)
const filters = computed<{ value: Filter; label: string }[]>(() =>
  props.kind === 'INVOICE'
    ? [
        { value: '', label: t('iv.f.all') },
        { value: 'open', label: t('iv.f.open') },
        { value: 'overdue', label: t('iv.state.overdue') },
        { value: 'paid', label: t('iv.state.paid') },
        { value: 'draft', label: t('iv.state.draft') },
      ]
    : [
        { value: '', label: t('iv.f.all') },
        { value: 'draft', label: t('iv.state.draft') },
        { value: 'sent', label: t('iv.state.sent') },
        { value: 'accepted', label: t('iv.state.accepted') },
      ],
)
async function load() {
  rows.value = await listDocs(db, { kind: props.kind, search: search.value, state: filter.value, clientId: clientId.value, today: todayStr })
  if (props.kind === 'INVOICE') owed.value = await outstanding(db, todayStr)
}
onMounted(load)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 200)
})
watch(filter, load)
const m = formatMoney
const cards = computed(() => {
  const o = owed.value
  if (!o) return []
  return (['USD', 'KHR'] as const).filter((c) => o[c].count || c === iv.currency).map((c) => ({ c, ...o[c] }))
})
async function add() {
  const id = await createDoc(db, props.kind, todayStr, clientId.value || null)
  router.push(`/d/${id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ kind === 'INVOICE' ? t('iv.nav.invoices') : t('iv.nav.quotes') }}</h1>
      <Button :label="kind === 'INVOICE' ? t('iv.newInvoice') : t('iv.newQuote')" icon="pi pi-plus" @click="add" />
    </div>

    <div v-if="kind === 'INVOICE' && cards.length" class="grid gap-3 sm:grid-cols-2">
      <div v-for="x in cards" :key="x.c" class="card flex flex-col gap-1">
        <span class="text-sm text-[var(--k-muted)]">{{ t('iv.toCollect') }} ({{ x.c }})</span>
        <span class="text-2xl font-semibold tabular-nums">{{ m(x.open, x.c) }}</span>
        <span class="text-sm text-[var(--k-muted)]">{{ t('iv.nInvoices', { n: x.count }) }}</span>
        <button v-if="x.overdueCount" type="button" class="self-start text-sm font-semibold text-red-700 underline dark:text-red-300" @click="filter = 'overdue'">
          <i class="pi pi-exclamation-triangle mr-1" />{{ t('iv.overdueSum', { n: x.overdueCount, amount: m(x.overdue, x.c) }) }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <IconField class="min-w-48 flex-1">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" :placeholder="t('iv.searchDocs')" class="w-full" />
      </IconField>
      <div class="flex flex-wrap gap-1">
        <Button v-for="f in filters" :key="f.value" :label="f.label" size="small" :outlined="filter !== f.value" @click="filter = f.value" />
      </div>
    </div>
    <p v-if="clientId" class="text-sm">
      {{ t('iv.forClient', { name: rows[0]?.client_name ?? '' }) }}
      <RouterLink :to="kind === 'INVOICE' ? '/' : '/quotes'" class="font-semibold underline">{{ t('iv.f.all') }}</RouterLink>
    </p>

    <p v-if="!rows.length" class="py-10 text-center text-[var(--k-muted)]">{{ kind === 'INVOICE' ? t('iv.noInvoices') : t('iv.noQuotes') }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="d in rows" :key="d.id">
        <RouterLink :to="`/d/${d.id}`" class="card flex items-center gap-3" :class="{ 'opacity-60': d.state === 'void' || d.state === 'declined' }">
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ d.client_company || d.client_name || t('iv.noClient') }}</span>
            <span class="block text-xs text-[var(--k-muted)]">
              {{ d.number ?? t('iv.state.draft') }} · {{ d.date }}<template v-if="d.due_date && !['paid', 'void', 'accepted', 'declined'].includes(d.state)"> · {{ kind === 'INVOICE' ? t('iv.dueOn', { date: d.due_date }) : t('iv.validTo', { date: d.due_date }) }}</template>
            </span>
          </span>
          <span class="flex flex-col items-end gap-1">
            <span class="font-semibold tabular-nums">{{ m(d.total, d.currency) }}</span>
            <span v-if="d.paid > 0 && (d.state === 'partial' || d.state === 'overdue')" class="text-xs tabular-nums text-[var(--k-muted)]">{{ t('iv.left', { amount: m(d.total - d.paid, d.currency) }) }}</span>
            <StateTag :state="d.state" />
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
