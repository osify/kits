<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import MoneyInput from '../components/MoneyInput.vue'
import CustomerDialog from '../components/CustomerDialog.vue'
import { addLedger, archiveCustomer, deleteLedger, ledger, listCustomers, type CustomerRow, type LedgerRow } from '../db/customers'
import { useShopStore } from '../stores/shop'
import { hasFeature } from '@/core/license'

/** Customers and what they owe (pay-later sales, manual debts, repayments). */
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const shop = useShopStore()
const allowed = computed(() => hasFeature('customers'))

const search = ref('')
const rows = ref<CustomerRow[]>([])
const onlyOwing = ref(false)
async function load() {
  rows.value = await listCustomers(shop.base, search.value)
}
onMounted(load)
watch(search, load)
watch(dataVersion, load)

const shown = computed(() => (onlyOwing.value ? rows.value.filter((r) => r.balance > 0) : rows.value))
const totalOwed = computed(() => rows.value.reduce((s, r) => s + Math.max(0, r.balance), 0))

// edit
const editOpen = ref(false)
const editing = ref<CustomerRow | null>(null)
function openEdit(c: CustomerRow | null) {
  editing.value = c
  editOpen.value = true
}

// detail
const detail = ref<CustomerRow | null>(null)
const entries = ref<LedgerRow[]>([])
async function openDetail(c: CustomerRow) {
  detail.value = c
  entries.value = await ledger(c.id)
  entryKind.value = c.balance > 0 ? 'PAYMENT' : 'CHARGE'
  entryAmount.value = c.balance > 0 ? c.balance : null
  entryNote.value = ''
}
async function refreshDetail() {
  await load()
  if (detail.value) {
    detail.value = rows.value.find((r) => r.id === detail.value!.id) ?? detail.value
    entries.value = await ledger(detail.value.id)
  }
}

// new ledger entry
const entryKind = ref<'PAYMENT' | 'CHARGE'>('PAYMENT')
const entryMethod = ref<'CASH' | 'KHQR' | 'CARD' | 'OTHER'>('CASH')
const entryAmount = ref<number | null>(null)
const entryNote = ref('')
const kindOptions = computed(() => [
  { label: t('pos.cust.payment'), value: 'PAYMENT' },
  { label: t('pos.cust.charge'), value: 'CHARGE' },
])
const methodOptions = computed(() => [
  { label: t('pos.sell.method.cash'), value: 'CASH' },
  { label: 'KHQR', value: 'KHQR' },
  { label: t('pos.sell.method.other'), value: 'OTHER' },
])
async function addEntry() {
  if (!detail.value || !entryAmount.value) return
  await addLedger({
    customerId: detail.value.id,
    kind: entryKind.value,
    amount: entryAmount.value,
    currency: shop.base,
    khrPerUsd: shop.rate,
    method: entryKind.value === 'PAYMENT' ? entryMethod.value : null,
    note: entryNote.value,
  })
  entryAmount.value = null
  entryNote.value = ''
  await refreshDetail()
  toast.add({ severity: 'success', summary: t('pos.c.saved'), life: 1500 })
}
function removeEntry(e: LedgerRow) {
  confirm.require({
    header: t('pos.c.delete'),
    message: t('pos.cust.deleteEntry'),
    acceptProps: { label: t('pos.c.delete'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await deleteLedger(e.id)
      await refreshDetail()
    },
  })
}
function archive(c: CustomerRow) {
  confirm.require({
    header: t('pos.cust.archive'),
    message: t('pos.cust.archiveConfirm', { name: c.name }),
    acceptProps: { label: t('pos.cust.archive'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await archiveCustomer(c.id)
      detail.value = null
      await load()
    },
  })
}
const amt = (e: LedgerRow) => shop.fmt(shop.toBase(e.amount, e.currency))
const voided = (e: LedgerRow) => e.sale_status === 'VOID'
const methodLabel = (m: string | null) => (m ? (m === 'KHQR' ? 'KHQR' : t(`pos.sell.method.${m.toLowerCase()}`)) : '')
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">{{ t('pos.nav.customers') }}</h1>
      <Button :label="t('pos.cust.new')" icon="pi pi-user-plus" size="small" :disabled="!allowed" @click="openEdit(null)" />
    </div>
    <Message v-if="!allowed" severity="info" :closable="false">{{ t('pos.plan.needs') }}</Message>

    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <div class="text-sm text-[var(--k-muted)]">{{ t('pos.cust.totalOwed') }}</div>
        <div class="text-2xl font-bold tabular-nums">{{ shop.fmt(totalOwed) }}</div>
      </div>
      <div class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <div class="text-sm text-[var(--k-muted)]">{{ t('pos.cust.owingCount') }}</div>
        <div class="text-2xl font-bold tabular-nums">{{ rows.filter((r) => r.balance > 0).length }}</div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <InputText v-model="search" :placeholder="t('pos.cust.search')" class="min-w-0 flex-1" />
      <Button :label="t('pos.cust.onlyOwing')" size="small" :outlined="!onlyOwing" @click="onlyOwing = !onlyOwing" />
    </div>

    <p v-if="!shown.length" class="py-8 text-center text-[var(--k-muted)]">{{ t('pos.cust.empty') }}</p>
    <ul v-else class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="c in shown" :key="c.id">
        <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--k-border)]/30" @click="openDetail(c)">
          <i class="pi pi-user text-[var(--k-muted)]" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ c.name }}</span>
            <span class="text-xs text-[var(--k-muted)]">{{ c.phone }}</span>
          </span>
          <span class="font-semibold tabular-nums" :class="c.balance > 0 ? 'text-amber-600' : 'text-[var(--k-muted)]'">
            {{ c.balance > 0 ? shop.fmt(c.balance) : c.balance < 0 ? `${t('pos.cust.credit')} ${shop.fmt(-c.balance)}` : '—' }}
          </span>
        </button>
      </li>
    </ul>

    <CustomerDialog v-model:visible="editOpen" :customer="editing" @saved="refreshDetail" />

    <Dialog :visible="!!detail" modal :header="detail?.name" class="w-[min(34rem,calc(100vw-1.5rem))]" @update:visible="detail = null">
      <div v-if="detail" class="flex flex-col gap-3">
        <div class="flex items-center gap-2 text-sm text-[var(--k-muted)]">
          <span>{{ detail.phone }}</span>
          <span class="flex-1" />
          <Button icon="pi pi-pencil" text size="small" :label="t('pos.c.edit')" @click="openEdit(detail)" />
        </div>
        <div class="rounded-lg bg-[var(--k-border)]/40 p-3">
          <div class="text-sm text-[var(--k-muted)]">{{ t('pos.cust.balance') }}</div>
          <div class="text-2xl font-bold tabular-nums" :class="{ 'text-amber-600': detail.balance > 0 }">{{ shop.fmt(detail.balance) }}</div>
          <div v-if="shop.dual && detail.balance" class="text-sm text-[var(--k-muted)]">{{ shop.fmtAlt(detail.balance) }}</div>
        </div>

        <div class="flex flex-col gap-2 rounded-lg border border-[var(--k-border)] p-3">
          <SelectButton v-model="entryKind" :options="kindOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
          <div class="grid grid-cols-2 gap-2">
            <MoneyInput v-model="entryAmount" :placeholder="t('pos.c.amount')" />
            <SelectButton v-if="entryKind === 'PAYMENT'" v-model="entryMethod" :options="methodOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
          </div>
          <InputText v-model="entryNote" :placeholder="t('pos.c.note')" />
          <Button :label="entryKind === 'PAYMENT' ? t('pos.cust.recordPayment') : t('pos.cust.addDebt')" icon="pi pi-check" :disabled="!entryAmount" @click="addEntry" />
        </div>

        <h3 class="font-semibold">{{ t('pos.cust.history') }}</h3>
        <p v-if="!entries.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.sum.noData') }}</p>
        <ul class="max-h-72 overflow-y-auto text-sm">
          <li v-for="e in entries" :key="e.id" class="flex items-center gap-2 border-t border-[var(--k-border)] py-1.5" :class="{ 'opacity-50': voided(e) }">
            <i :class="e.kind === 'CHARGE' ? 'pi pi-arrow-up-right text-amber-600' : 'pi pi-arrow-down-left text-primary-600'" />
            <span class="flex-1">
              {{ e.business_date }} ·
              {{ e.kind === 'CHARGE' ? (e.sale_number ? `${t('pos.cust.sale')} #${e.sale_number}` : t('pos.cust.charge')) : `${t('pos.cust.payment')} (${methodLabel(e.method)})` }}
              <Tag v-if="voided(e)" severity="danger" :value="t('pos.status.void')" class="ml-1" />
              <span v-if="e.note" class="text-[var(--k-muted)]"> · {{ e.note }}</span>
            </span>
            <span class="tabular-nums" :class="{ 'line-through': voided(e) }">{{ e.kind === 'PAYMENT' ? '−' : '+' }}{{ amt(e) }}</span>
            <Button v-if="!e.sale_id" icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="t('pos.c.delete')" @click="removeEntry(e)" />
          </li>
        </ul>
      </div>
      <template #footer>
        <Button :label="t('pos.cust.archive')" text severity="secondary" class="mr-auto" @click="detail && archive(detail)" />
        <Button :label="t('pos.c.close')" @click="detail = null" />
      </template>
    </Dialog>
  </div>
</template>
