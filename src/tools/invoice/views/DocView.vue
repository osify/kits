<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import AmountField from '@/components/AmountField.vue'
import PrintSheet from '@/tools/pos/components/PrintSheet.vue'
import StateTag from '../components/StateTag.vue'
import ClientDialog from '../components/ClientDialog.vue'
import LineDialog from '../components/LineDialog.vue'
import InvoiceDoc from '../components/InvoiceDoc.vue'
import { db } from '../db'
import {
  addPayment, changeCurrency, deleteDoc, docState, duplicateDoc, getClient, getDoc, inRiel, issueInvoice, lineAmount, listClients, listLines, listPayments, moveLine,
  quoteToInvoice, removePayment, reopenInvoice, setDocClient, shareText, updateDoc, voidInvoice, type Client, type ClientRow, type Doc, type Line, type Payment,
} from '../db/data'
import { useInvoice } from '../store'
import { formatMoney, type Currency } from '@/core/util/money'
import { today } from '@/core/util/date'
import { imageUrl } from '@/core/files/images'

/** One quote or invoice: client, dates, lines, totals with VAT, payments, print and share. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const iv = useInvoice()
const id = route.params.id as string
const todayStr = today()

const doc = ref<Doc | null>(null)
const lines = ref<Line[]>([])
const payments = ref<Payment[]>([])
const clients = ref<ClientRow[]>([])
async function load() {
  const [dd, ll, pp, cc] = await Promise.all([getDoc(db, id), listLines(db, id), listPayments(db, id), listClients(db)])
  ;[doc.value, lines.value, payments.value, clients.value] = [dd ?? null, ll, pp, cc]
}
onMounted(load)

const d = computed(() => doc.value!)
const cur = computed(() => d.value.currency)
const m = (v: number) => formatMoney(v, cur.value)
const paid = computed(() => payments.value.reduce((s, p) => s + p.amount, 0))
const state = computed(() => docState(d.value, paid.value, todayStr))
const isQuote = computed(() => d.value.kind === 'QUOTE')
const editable = computed(() => (isQuote.value ? d.value.status !== 'ACCEPTED' : d.value.status === 'DRAFT'))
const title = computed(() => (isQuote.value ? t('iv.doc.quote') : t('iv.doc.invoice')))

// ── fields ──
const toDate = (s: string | null) => (s ? new Date(s + 'T00:00:00') : null)
async function set(f: Partial<Doc>) {
  await updateDoc(db, id, f as any)
  await load()
}
const clientOpts = computed(() => clients.value.map((c) => ({ value: c.id, label: c.company ? `${c.company} · ${c.name}` : c.name })))
async function pickClient(cid: string | null) {
  await setDocClient(db, id, cid)
  await load()
}
const clientOpen = ref(false)
const editClient = ref<Client | null>(null)
async function newClient() {
  editClient.value = null
  clientOpen.value = true
}
async function editDocClient() {
  editClient.value = d.value.client_id ? ((await getClient(db, d.value.client_id)) ?? null) : null
  clientOpen.value = true
}
async function clientSaved(cid: string) {
  if (cid) await setDocClient(db, id, cid) // refresh the copy on this document
  await load()
}
const curOpts = [
  { label: '$ USD', value: 'USD' },
  { label: '៛ KHR', value: 'KHR' },
]
async function setCurrency(c: Currency) {
  await changeCurrency(db, id, c)
  await load()
  if (lines.value.length) toast.add({ severity: 'info', summary: t('iv.converted', { rate: d.value.khr_per_usd.toLocaleString('en-US') }), life: 3000 })
}

// ── lines ──
const lineOpen = ref(false)
const editLine = ref<Line | null>(null)
function openLine(l?: Line) {
  if (!editable.value) return
  editLine.value = l ?? null
  lineOpen.value = true
}
async function move(l: Line, dir: -1 | 1) {
  await moveLine(db, l.id, dir)
  await load()
}

// ── actions ──
async function issue() {
  if (!lines.value.length) return void toast.add({ severity: 'warn', summary: t('iv.needLines'), life: 3000 })
  await issueInvoice(db, id)
  await load()
  toast.add({ severity: 'success', summary: t('iv.issuedAs', { number: d.value.number }), life: 3000 })
}
async function reopen() {
  try {
    await reopenInvoice(db, id)
    await load()
  } catch {
    toast.add({ severity: 'warn', summary: t('iv.hasPayments'), life: 4000 })
  }
}
function voidIt() {
  confirm.require({
    header: t('iv.void'),
    message: t('iv.voidConfirm', { number: d.value.number }),
    icon: 'pi pi-ban',
    acceptProps: { label: t('iv.void'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await voidInvoice(db, id)
      await load()
    },
  })
}
function remove() {
  confirm.require({
    message: t('iv.deleteDocConfirm'),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteDoc(db, id)
      router.replace(isQuote.value ? '/quotes' : '/')
    },
  })
}
async function toInvoice() {
  const nid = await quoteToInvoice(db, id, todayStr)
  router.push(`/d/${nid}`)
}
async function duplicate() {
  const nid = await duplicateDoc(db, id, todayStr)
  router.push(`/d/${nid}`)
}

// ── payments ──
const payOpen = ref(false)
const METHODS = ['CASH', 'BANK', 'KHQR', 'CARD', 'CHEQUE', 'OTHER']
const pay = reactive({ date: new Date(), amount: 0, method: 'BANK', note: '' })
function openPay() {
  Object.assign(pay, { date: new Date(), amount: Math.max(0, d.value.total - paid.value), method: 'BANK', note: '' })
  payOpen.value = true
}
async function savePay() {
  if (!(pay.amount > 0)) return
  await addPayment(db, id, { date: today(pay.date), amount: pay.amount, method: pay.method, note: pay.note })
  payOpen.value = false
  await load()
  if (paid.value >= d.value.total) toast.add({ severity: 'success', summary: t('iv.paidInFull'), life: 3000 })
}
function delPay(p: Payment) {
  confirm.require({
    message: t('iv.deletePayConfirm', { amount: m(p.amount), date: p.date }),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await removePayment(db, p.id)
      await load()
    },
  })
}

// ── print & share ──
const printing = ref(false)
const printKind = ref<'QUOTE' | 'INVOICE' | 'RECEIPT'>('INVOICE')
const logo = ref<string | null>(null)
const khqr = ref<string | null>(null)
async function print(kind: 'QUOTE' | 'INVOICE' | 'RECEIPT') {
  ;[logo.value, khqr.value] = await Promise.all([imageUrl('invoice', iv.settings.logo), imageUrl('invoice', iv.settings.khqr)])
  printKind.value = kind
  printing.value = true
}
async function share() {
  const text = shareText(d.value, paid.value, iv.settings, formatMoney, { title: title.value, total: t('iv.total'), due: isQuote.value ? t('iv.validUntil') : t('iv.dueDate'), balance: t('iv.balance') })
  try {
    if (navigator.share) await navigator.share({ text })
    else {
      await navigator.clipboard.writeText(text)
      toast.add({ severity: 'success', summary: t('iv.copied'), life: 2000 })
    }
  } catch {
    /* share cancelled */
  }
}
</script>

<template>
  <div v-if="doc" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.push(isQuote ? '/quotes' : '/')" />
      <h1 class="text-xl font-semibold">{{ title }} {{ d.number ?? '' }}</h1>
      <StateTag :state="state" />
      <span class="flex-1" />
      <Button :label="t('iv.print')" icon="pi pi-print" outlined @click="print(isQuote ? 'QUOTE' : 'INVOICE')" />
      <Button :label="t('iv.share')" icon="pi pi-share-alt" outlined @click="share" />
    </div>

    <!-- Next step -->
    <Message v-if="!isQuote && d.status === 'DRAFT'" severity="info" :closable="false">
      <div class="flex flex-wrap items-center gap-2">
        <span class="flex-1">{{ t('iv.draftHint') }}</span>
        <Button :label="t('iv.issue')" icon="pi pi-check" @click="issue" />
      </div>
    </Message>
    <Message v-else-if="d.status === 'VOID'" severity="secondary" :closable="false">{{ t('iv.voidHint') }}</Message>

    <!-- Client -->
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('iv.client') }}</h2>
      <div v-if="editable" class="flex flex-wrap gap-2">
        <Select :model-value="d.client_id" :options="clientOpts" option-label="label" option-value="value" filter show-clear :placeholder="t('iv.pickClient')" class="min-w-56 flex-1" @update:model-value="pickClient" />
        <Button :label="t('iv.newClient')" icon="pi pi-user-plus" outlined @click="newClient" />
      </div>
      <div v-if="d.client_name" class="text-sm">
        <b v-if="d.client_company">{{ d.client_company }} · </b>{{ d.client_name }}
        <span v-if="d.client_vat_tin" class="text-[var(--k-muted)]"> · VATTIN {{ d.client_vat_tin }}</span>
        <span v-if="d.client_phone" class="text-[var(--k-muted)]"> · {{ d.client_phone }}</span>
        <button v-if="editable && d.client_id" type="button" class="ml-2 underline" @click="editDocClient">{{ t('common.edit') }}</button>
      </div>
    </section>

    <!-- Dates, currency, VAT -->
    <section class="card grid gap-3 sm:grid-cols-2">
      <label class="field">
        <span>{{ t('iv.date') }}</span>
        <DatePicker :model-value="toDate(d.date)" date-format="yy-mm-dd" show-icon :disabled="!editable" @update:model-value="(x: any) => x && set({ date: today(x) })" />
      </label>
      <label class="field">
        <span>{{ isQuote ? t('iv.validUntil') : t('iv.dueDate') }}</span>
        <DatePicker :model-value="toDate(d.due_date)" date-format="yy-mm-dd" show-icon show-clear :disabled="d.status === 'VOID'" @update:model-value="(x: any) => set({ due_date: x ? today(x) : null })" />
      </label>
      <div class="field">
        <span>{{ t('iv.currency') }}</span>
        <SelectButton :model-value="d.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" :disabled="!editable" @update:model-value="setCurrency" />
      </div>
      <label class="field">
        <span>{{ t('iv.rate') }}</span>
        <InputNumber :model-value="d.khr_per_usd" :min="1" suffix=" ៛ / $1" :disabled="!editable" @blur="(e: any) => { const v = Number(String(e.value).replace(/[^0-9]/g, '')); if (v > 0 && v !== d.khr_per_usd) set({ khr_per_usd: v }) }" />
      </label>
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <ToggleSwitch :model-value="d.vat_rate > 0" :disabled="!editable" @update:model-value="(x: boolean) => set({ vat_rate: x ? 10 : 0 })" />
        {{ t('iv.addVat') }}
        <span v-if="d.vat_rate && !iv.settings.vat_tin" class="text-amber-700 dark:text-amber-300">· {{ t('iv.noVatTin') }}</span>
      </label>
    </section>

    <!-- Lines -->
    <section class="card flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold">{{ t('iv.lines') }}</h2>
        <Button v-if="editable" :label="t('iv.addLine')" icon="pi pi-plus" size="small" @click="openLine()" />
      </div>
      <p v-if="!lines.length" class="py-4 text-center text-sm text-[var(--k-muted)]">{{ t('iv.noLines') }}</p>
      <ul class="flex flex-col divide-y divide-[var(--k-border)]">
        <li v-for="(l, i) in lines" :key="l.id" class="flex items-center gap-2 py-2">
          <button type="button" class="min-w-0 flex-1 text-left" :disabled="!editable" @click="openLine(l)">
            <span class="block font-semibold">{{ l.name }}</span>
            <span v-if="l.detail" class="block text-xs text-[var(--k-muted)]">{{ l.detail }}</span>
            <span class="block text-xs tabular-nums text-[var(--k-muted)]">{{ l.qty }}{{ l.unit ? ` ${l.unit}` : '' }} × {{ m(l.price) }}</span>
          </button>
          <span class="font-semibold tabular-nums">{{ m(lineAmount(l, cur)) }}</span>
          <span v-if="editable && lines.length > 1" class="flex flex-col">
            <button type="button" class="px-1 text-[var(--k-muted)] disabled:opacity-30" :disabled="i === 0" :aria-label="t('iv.moveUp')" @click="move(l, -1)"><i class="pi pi-chevron-up text-xs" /></button>
            <button type="button" class="px-1 text-[var(--k-muted)] disabled:opacity-30" :disabled="i === lines.length - 1" :aria-label="t('iv.moveDown')" @click="move(l, 1)"><i class="pi pi-chevron-down text-xs" /></button>
          </span>
        </li>
      </ul>
      <div class="ml-auto flex w-full max-w-sm flex-col gap-1 border-t border-[var(--k-border)] pt-2 text-sm">
        <div class="flex justify-between"><span>{{ t('iv.subtotal') }}</span><span class="tabular-nums">{{ m(d.subtotal) }}</span></div>
        <div class="flex items-center justify-between gap-2">
          <span>{{ t('iv.discount') }}</span>
          <AmountField v-if="editable" :model-value="d.discount" :currency="cur" class="!w-36" @update:model-value="(v: number) => v !== d.discount && set({ discount: v })" />
          <span v-else class="tabular-nums">−{{ m(d.discount) }}</span>
        </div>
        <div v-if="d.vat_rate" class="flex justify-between"><span>{{ t('iv.vatLine', { rate: d.vat_rate }) }}</span><span class="tabular-nums">{{ m(d.vat) }}</span></div>
        <div class="flex justify-between text-lg font-semibold"><span>{{ t('iv.total') }}</span><span class="tabular-nums">{{ m(d.total) }}</span></div>
        <div v-if="cur === 'USD'" class="flex justify-between text-[var(--k-muted)]"><span>{{ t('iv.inRiel') }}</span><span class="tabular-nums">{{ formatMoney(inRiel(d.total, 'USD', d.khr_per_usd), 'KHR') }}</span></div>
      </div>
    </section>

    <!-- Payments -->
    <section v-if="!isQuote && d.status === 'ISSUED'" class="card flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold">{{ t('iv.payments') }}</h2>
        <Button v-if="paid < d.total" :label="t('iv.recordPayment')" icon="pi pi-wallet" size="small" @click="openPay" />
      </div>
      <p v-if="!payments.length" class="text-sm text-[var(--k-muted)]">{{ t('iv.noPayments') }}</p>
      <ul class="flex flex-col divide-y divide-[var(--k-border)]">
        <li v-for="p in payments" :key="p.id" class="flex items-center gap-2 py-2 text-sm">
          <i class="pi pi-check-circle text-primary-600" />
          <span class="flex-1">{{ p.date }} · {{ t(`iv.method.${p.method}`, p.method ?? '') }}<template v-if="p.note"> · {{ p.note }}</template></span>
          <span class="font-semibold tabular-nums">{{ m(p.amount) }}</span>
          <Button icon="pi pi-trash" text rounded size="small" severity="secondary" :aria-label="t('common.delete')" @click="delPay(p)" />
        </li>
      </ul>
      <div class="flex justify-between border-t border-[var(--k-border)] pt-2 font-semibold">
        <span>{{ t('iv.balance') }}</span><span class="tabular-nums">{{ m(Math.max(0, d.total - paid)) }}</span>
      </div>
      <Button v-if="payments.length" :label="t('iv.printReceipt')" icon="pi pi-receipt" outlined size="small" class="self-start" @click="print('RECEIPT')" />
    </section>

    <!-- Notes -->
    <section class="card flex flex-col gap-3">
      <label class="field">
        <span>{{ t('iv.noteOnDoc') }}</span>
        <Textarea :model-value="d.note ?? ''" rows="2" auto-resize :disabled="!editable" :placeholder="t('iv.notePh')" @blur="(e: any) => e.target.value !== (d.note ?? '') && set({ note: e.target.value })" />
      </label>
      <label class="field">
        <span>{{ t('iv.terms') }}</span>
        <Textarea :model-value="d.terms ?? ''" rows="2" auto-resize :disabled="!editable" @blur="(e: any) => e.target.value !== (d.terms ?? '') && set({ terms: e.target.value })" />
      </label>
    </section>

    <!-- More actions -->
    <section class="flex flex-wrap gap-2">
      <template v-if="isQuote">
        <Button v-if="d.status === 'DRAFT'" :label="t('iv.markSent')" icon="pi pi-send" outlined @click="set({ status: 'SENT' })" />
        <Button v-if="d.status !== 'ACCEPTED'" :label="t('iv.makeInvoice')" icon="pi pi-file" @click="toInvoice" />
        <Button v-if="d.status === 'DRAFT' || d.status === 'SENT'" :label="t('iv.declined')" icon="pi pi-times" text severity="secondary" @click="set({ status: 'DECLINED' })" />
        <Button v-if="d.status === 'DECLINED'" :label="t('iv.reopenQuote')" icon="pi pi-undo" text @click="set({ status: 'SENT' })" />
      </template>
      <Button :label="t('iv.duplicate')" icon="pi pi-copy" text @click="duplicate" />
      <Button v-if="!isQuote && d.status === 'ISSUED' && !payments.length" :label="t('iv.backToDraft')" icon="pi pi-pencil" text @click="reopen" />
      <Button v-if="!isQuote && d.status === 'ISSUED'" :label="t('iv.void')" icon="pi pi-ban" text severity="danger" @click="voidIt" />
      <Button v-if="isQuote || (d.status === 'DRAFT' && !d.number)" :label="t('common.delete')" icon="pi pi-trash" text severity="danger" @click="remove" />
    </section>

    <ClientDialog v-model:open="clientOpen" :client="editClient" @saved="clientSaved" />
    <LineDialog v-model:open="lineOpen" :doc-id="id" :line="editLine" :currency="cur" :rate="d.khr_per_usd" @saved="load" />

    <Dialog v-model:visible="payOpen" modal :header="t('iv.recordPayment')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('iv.date') }}</span><DatePicker v-model="pay.date" date-format="yy-mm-dd" show-icon /></label>
        <label class="field"><span>{{ t('iv.amount') }} ({{ cur }})</span><AmountField v-model="pay.amount" :currency="cur" autofocus /></label>
        <div class="field">
          <span>{{ t('iv.methodLabel') }}</span>
          <div class="flex flex-wrap gap-1">
            <Button v-for="k in METHODS" :key="k" :label="t(`iv.method.${k}`)" size="small" :outlined="pay.method !== k" @click="pay.method = k" />
          </div>
        </div>
        <label class="field"><span>{{ t('iv.note') }}</span><Textarea v-model="pay.note" rows="1" auto-resize :placeholder="t('iv.payNotePh')" /></label>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="payOpen = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!(pay.amount > 0)" @click="savePay" />
      </template>
    </Dialog>

    <PrintSheet v-model:open="printing" :paper-mm="210">
      <InvoiceDoc :kind="printKind" :doc="d" :lines="lines" :payments="payments" :biz="iv.settings" :logo="logo" :khqr="khqr" />
    </PrintSheet>
  </div>
</template>
