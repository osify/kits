<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import AmountField from '@/components/AmountField.vue'
import SheetTable from '../components/SheetTable.vue'
import { db } from '../db'
import {
  getDetail, saveRound, deleteLastRound, setPaid, payAll, closeRound, saveMember, deleteMember, reorderMembers, setHead,
  setCircleClosed, deleteCircle, type CircleDetail, type Member, type Round,
} from '../db/data'
import { dues, potOf, roundDate, liveBefore, summary } from '../rules'
import { useTongtin } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/**
 * One circle, one round at a time:
 *   1. Winner: who took the pot this round and their final bid (the bidding itself happens in person).
 *   2. Collect: everyone else pays their share (waiting: amount − bid, already received: full amount).
 *   3. Close: the pot is given to the winner, the round closes and the next one opens.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const tt = useTongtin()
const id = route.params.id as string
const d = ref<CircleDetail | null>(null)
const tab = ref<'rounds' | 'sheet' | 'hands'>('rounds')
const open = ref<number | null>(null) // expanded past round

async function load() {
  d.value = await getDetail(db, id)
  if (!d.value) return void router.replace('/')
  resetDraw()
}
onMounted(load)
watch(() => tt.version, load)

const c = computed(() => d.value!.circle)
const m = (v: number) => formatMoney(v, c.value.currency)
const nameOf = (mid: string | null) => d.value?.members.find((x) => x.id === mid)?.name ?? '?'
const hands = computed(() => d.value?.members.length ?? 0)
const drawn = computed(() => d.value?.rounds.length ?? 0)
const finished = computed(() => hands.value > 0 && drawn.value >= hands.value)
const sums = computed(() => (d.value ? summary(c.value, d.value.members, d.value.rounds, d.value.payments) : []))
const totalOwing = computed(() => sums.value.reduce((s, r) => s + Math.max(0, r.owing), 0))
const wonIn = computed(() => new Map((d.value?.rounds ?? []).map((r) => [r.winner_id, r.no])))

/** The round being collected (winner confirmed, not closed), if any. */
const openRound = computed<Round | null>(() => {
  const last = d.value?.rounds.at(-1)
  return last && !last.closed_at ? last : null
})
/** Step: 'bid' (choose the winner), 'collect' (tick payments, then close), or null (nothing to do). */
const step = computed<'bid' | 'collect' | null>(() => {
  if (!d.value || c.value.closed_at) return null
  if (openRound.value) return 'collect'
  if (finished.value || hands.value < 2) return null
  return 'bid'
})
const roundNo = computed(() => openRound.value?.no ?? drawn.value + 1)

// ── Step 1: bids ─────────────────────────────────────────────────────────────
const live = computed(() => (d.value ? liveBefore(d.value.members, d.value.rounds, roundNo.value) : []))
const headRound = computed(() => !!d.value && c.value.mode === 'BID' && !!c.value.head_first && roundNo.value === 1)
const draw = reactive({ date: new Date(), winner: '', bid: 0 })
function resetDraw() {
  if (!d.value) return
  draw.date = new Date(roundDate(c.value.start_date, c.value.every, roundNo.value) + 'T00:00:00')
  draw.bid = 0
  if (headRound.value) draw.winner = live.value.some((x) => x.id === c.value.head_id) ? c.value.head_id! : (live.value[0]?.id ?? '')
  else if (c.value.mode === 'ORDER') draw.winner = live.value[0]?.id ?? ''
  else draw.winner = ''
}
const winnerBid = computed(() => (headRound.value || c.value.mode === 'ORDER' ? 0 : Math.max(0, Math.min(draw.bid || 0, c.value.amount))))
const preview = computed(() => {
  if (!d.value || !draw.winner) return null
  const due = dues(c.value, d.value.members, d.value.rounds, roundNo.value, draw.winner, winnerBid.value)
  const vals = [...due.values()]
  const dead = vals.filter((v) => v === c.value.amount && winnerBid.value > 0).length
  return { pot: potOf(due), waitPay: c.value.amount - winnerBid.value, waiting: vals.length - dead, dead }
})
const winnerOpts = computed(() => live.value.map((x) => ({ label: x.name + (x.id === c.value.head_id ? ` (${t('tt.head')})` : ''), value: x.id })))
async function confirmWinner() {
  if (!draw.winner) return
  await saveRound(db, { circle_id: id, no: roundNo.value, date: today(draw.date), winner_id: draw.winner, bid: winnerBid.value })
  await load()
  toast.add({ severity: 'success', summary: t('tt.drawn', { name: nameOf(draw.winner) }), life: 2500 })
}

// ── Step 2 & 3: collect, then close ─────────────────────────────────────────
function payersOf(r: Round) {
  const due = dues(c.value, d.value!.members, d.value!.rounds, r.no, r.winner_id, r.bid)
  const paid = new Set(d.value!.payments.filter((p) => p.round_id === r.id).map((p) => p.member_id))
  const list = [...due].map(([mid, v]) => ({ id: mid, name: nameOf(mid), due: v, paid: paid.has(mid), received: (wonIn.value.get(mid) ?? Infinity) < r.no }))
  const collected = list.filter((p) => p.paid).reduce((s, p) => s + p.due, 0)
  return { list, pot: potOf(due), collected, paidCount: list.filter((p) => p.paid).length }
}
const current = computed(() => (openRound.value ? payersOf(openRound.value) : null))
async function togglePaid(roundId: string, mid: string, due: number, paid: boolean) {
  await setPaid(db, roundId, mid, paid ? due : null)
  await load()
}
async function allPaid(no: number) {
  await payAll(db, id, no)
  await load()
}
function closeCurrent() {
  const r = openRound.value
  if (!r || !current.value) return
  const missing = current.value.list.length - current.value.paidCount
  const doClose = async () => {
    await closeRound(db, r.id, true)
    await tt.load()
    toast.add({ severity: 'success', summary: t('tt.roundClosed', { n: r.no }), life: 2500 })
  }
  if (!missing) return void doClose()
  confirm.require({
    message: t('tt.closeUnpaid', { n: missing }),
    acceptProps: { label: t('tt.closeAnyway') },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: doClose,
  })
}
function changeWinner() {
  confirm.require({
    message: t('tt.changeWinnerConfirm'),
    acceptProps: { label: t('tt.changeWinner'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteLastRound(db, id)
      await load()
    },
  })
}

// ── History ──────────────────────────────────────────────────────────────────
const history = computed(() =>
  (d.value?.rounds ?? [])
    .filter((r) => r.closed_at)
    .map((r) => ({ ...r, ...payersOf(r) }))
    .reverse(),
)
async function reopen(r: Round) {
  if (openRound.value) return
  await closeRound(db, r.id, false)
  await tt.load()
}

// ── Hands ────────────────────────────────────────────────────────────────────
const newHand = ref('')
async function addHand() {
  if (!newHand.value.trim()) return
  await saveMember(db, { circle_id: id, name: newHand.value })
  newHand.value = ''
  await load()
}
const edit = reactive({ open: false, id: '', name: '', phone: '' })
function editHand(x: Member) {
  Object.assign(edit, { open: true, id: x.id, name: x.name, phone: x.phone ?? '' })
}
async function saveHand() {
  if (!edit.name.trim()) return
  await saveMember(db, { id: edit.id, circle_id: id, name: edit.name, phone: edit.phone })
  edit.open = false
  await load()
}
async function removeHand() {
  if (!(await deleteMember(db, edit.id))) return void toast.add({ severity: 'warn', summary: t('tt.cannotRemove'), life: 4000 })
  edit.open = false
  await load()
}
async function makeHead() {
  await setHead(db, id, edit.id)
  edit.open = false
  await load()
}
async function move(i: number, dir: -1 | 1) {
  const ids = d.value!.members.map((x) => x.id)
  const j = i + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  await reorderMembers(db, id, ids)
  await load()
}
const tabs = computed(() => [
  { label: t('tt.rounds'), value: 'rounds' },
  { label: t('tt.sheetTab'), value: 'sheet' },
  { label: t('tt.handsTab'), value: 'hands' },
])

async function toggleClosed() {
  await setCircleClosed(db, id, !c.value.closed_at)
  await tt.load()
}
function remove() {
  confirm.require({
    message: t('tt.deleteConfirm', { name: c.value.name }),
    acceptProps: { label: t('tt.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteCircle(db, id)
      await tt.load()
      router.replace('/')
    },
  })
}
const tel = (p: string | null) => (p ? `tel:${p.replace(/[^\d+]/g, '')}` : null)
const steps = computed(() => [
  { key: 'bid', label: t('tt.step.winner') },
  { key: 'collect', label: t('tt.step.collect') },
  { key: 'close', label: t('tt.step.close') },
])
</script>

<template>
  <div v-if="d" class="flex flex-col gap-4">
    <div class="flex items-start gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.push('/')" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ c.name }}</h1>
        <p class="text-sm text-[var(--k-muted)]">
          {{ m(c.amount) }} × {{ hands }} {{ t('tt.hands') }} · {{ t(`tt.every.${c.every}`) }} · {{ t(`tt.mode.${c.mode}`) }}
        </p>
      </div>
      <RouterLink :to="`/c/${id}/edit`"><Button icon="pi pi-pencil" text rounded :aria-label="t('tt.editCircle')" /></RouterLink>
    </div>

    <div class="grid grid-cols-3 gap-3">
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('tt.progress') }}</div><div class="text-lg font-semibold">{{ history.length }} / {{ hands }}</div></div>
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('tt.fullPot') }}</div><div class="text-lg font-semibold tabular-nums">{{ m(c.amount * Math.max(0, hands - 1)) }}</div></div>
      <div class="card">
        <div class="text-xs text-[var(--k-muted)]">{{ t('tt.owing') }}</div>
        <div class="text-lg font-semibold tabular-nums" :class="totalOwing ? 'text-amber-700 dark:text-amber-400' : ''">{{ m(totalOwing) }}</div>
      </div>
    </div>

    <Message v-if="c.closed_at" severity="secondary" :closable="false">{{ t('tt.closedNote') }}</Message>
    <Message v-else-if="finished && !openRound" severity="success" :closable="false">{{ t('tt.finishedNote') }}</Message>
    <Message v-else-if="hands < 2" severity="warn" :closable="false">{{ t('tt.needHands') }}</Message>

    <!-- Current round -->
    <section v-if="step" class="card flex flex-col gap-4 border-primary-300 dark:border-primary-800">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold">{{ t('tt.nextRound', { n: roundNo }) }}</h2>
        <span class="text-sm text-[var(--k-muted)]">{{ openRound ? openRound.date : today(draw.date) }}</span>
      </div>
      <ol class="flex gap-1 text-xs" :aria-label="t('tt.stepsLabel')">
        <li
          v-for="(s, i) in steps"
          :key="s.key"
          class="flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5"
          :class="(step === 'bid' ? 0 : 1) === i || (step === 'collect' && i === 2)
            ? 'bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200'
            : (step === 'collect' && i === 0) ? 'text-[var(--k-muted)] line-through' : 'text-[var(--k-muted)]'"
        >
          <span class="grid size-5 shrink-0 place-items-center rounded-full border border-current text-[10px]">{{ i + 1 }}</span>{{ s.label }}
        </li>
      </ol>

      <!-- Step 1: bids / choose winner -->
      <template v-if="step === 'bid'">
        <div v-if="headRound" class="text-sm">{{ t('tt.headRoundNote', { name: nameOf(draw.winner) }) }}</div>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <label class="field">
            <span>{{ c.mode === 'BID' ? t('tt.winnerBid') : t('tt.winner') }}</span>
            <Select v-model="draw.winner" :options="winnerOpts" option-label="label" option-value="value" :placeholder="t('tt.pickWinner')" filter :filter-placeholder="t('tt.searchName')" />
            <small class="text-[var(--k-muted)]">{{ t('tt.waitingCount', { n: live.length }) }}</small>
          </label>
          <label v-if="c.mode === 'BID'" class="field">
            <span>{{ t('tt.finalBid') }}</span>
            <AmountField v-model="draw.bid" :currency="c.currency" />
            <small class="text-[var(--k-muted)]">{{ t('tt.finalBidHint') }}</small>
          </label>
        </div>

        <label class="field max-w-xs"><span>{{ t('tt.date') }}</span><DatePicker v-model="draw.date" date-format="yy-mm-dd" show-icon /></label>

        <div v-if="preview" class="rounded-lg bg-primary-50 p-3 text-sm dark:bg-primary-950/50">
          <div class="text-base">
            <i class="pi pi-trophy mr-1 text-amber-500" />{{ t('tt.receives', { name: nameOf(draw.winner) }) }}
            <b class="tabular-nums">{{ m(preview.pot) }}</b>
            <span v-if="winnerBid" class="text-[var(--k-muted)]"> ({{ t('tt.bidShort', { amount: m(winnerBid) }) }})</span>
          </div>
          <ul class="mt-1 list-inside list-disc text-[var(--k-muted)]">
            <li>{{ t('tt.waitPay', { n: preview.waiting, amount: m(preview.waitPay) }) }}</li>
            <li v-if="preview.dead">{{ t('tt.deadPay', { n: preview.dead, amount: m(c.amount) }) }}</li>
          </ul>
        </div>
        <Button :label="t('tt.confirmWinner')" icon="pi pi-check" class="self-start" :disabled="!draw.winner || draw.bid > c.amount" @click="confirmWinner" />
      </template>

      <!-- Step 2 + 3: collect, then close -->
      <template v-else-if="step === 'collect' && openRound && current">
        <div class="rounded-lg bg-primary-50 p-3 dark:bg-primary-950/50">
          <div class="text-base">
            <i class="pi pi-trophy mr-1 text-amber-500" />{{ t('tt.receives', { name: nameOf(openRound.winner_id) }) }}
            <b class="tabular-nums">{{ m(current.pot) }}</b>
            <span v-if="openRound.bid" class="text-sm text-[var(--k-muted)]"> ({{ t('tt.bidShort', { amount: m(openRound.bid) }) }})</span>
          </div>
          <button type="button" class="mt-1 text-xs underline" @click="changeWinner">{{ t('tt.changeWinner') }}</button>
        </div>
        <ul class="flex flex-col divide-y divide-[var(--k-border)]">
          <li v-for="p in current.list" :key="p.id" class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ p.name }}</span>
              <span class="block text-xs text-[var(--k-muted)]">{{ p.received ? t('tt.alreadyReceived') : t('tt.stillWaiting') }}</span>
            </span>
            <span class="font-semibold tabular-nums">{{ m(p.due) }}</span>
            <Button
              :label="p.paid ? t('tt.paid') : t('tt.markPaid')"
              :icon="p.paid ? 'pi pi-check-circle' : 'pi pi-circle'"
              :severity="p.paid ? 'success' : 'secondary'"
              :outlined="!p.paid"
              size="small"
              class="w-28 shrink-0"
              :aria-pressed="p.paid"
              @click="togglePaid(openRound.id, p.id, p.due, !p.paid)"
            />
          </li>
        </ul>
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span>{{ t('tt.collected', { got: m(current.collected), pot: m(current.pot) }) }}</span>
            <span class="text-[var(--k-muted)]">{{ t('tt.paidCount', { n: current.paidCount, total: current.list.length }) }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-[var(--k-border)]" role="progressbar" :aria-valuenow="current.collected" :aria-valuemax="current.pot">
            <div class="h-full rounded-full bg-primary-600 transition-all" :style="{ width: `${current.pot ? (current.collected / current.pot) * 100 : 0}%` }" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button v-if="current.paidCount < current.list.length" :label="t('tt.allPaid')" icon="pi pi-check-square" outlined @click="allPaid(openRound.no)" />
          <Button
            :label="t('tt.closeRound', { name: nameOf(openRound.winner_id) })"
            icon="pi pi-lock"
            :severity="current.paidCount === current.list.length ? undefined : 'secondary'"
            @click="closeCurrent"
          />
        </div>
      </template>
    </section>

    <SelectButton v-model="tab" :options="tabs" option-label="label" option-value="value" :allow-empty="false" class="self-start" />

    <!-- Closed rounds -->
    <section v-if="tab === 'rounds'" class="flex flex-col gap-2">
      <p v-if="!history.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('tt.noRounds') }}</p>
      <div v-for="(r, i) in history" :key="r.id" class="card !p-0">
        <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" :aria-expanded="open === r.no" @click="open = open === r.no ? null : r.no">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">{{ r.no }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ nameOf(r.winner_id) }}</span>
            <span class="block text-xs text-[var(--k-muted)]">{{ r.date }}<template v-if="r.bid"> · {{ t('tt.bidShort', { amount: m(r.bid) }) }}</template></span>
          </span>
          <span class="text-right">
            <span class="block font-semibold tabular-nums">{{ m(r.pot) }}</span>
            <Tag :severity="r.paidCount === r.list.length ? 'success' : 'warn'" :value="r.paidCount === r.list.length ? t('tt.allPaidTag') : t('tt.paidCount', { n: r.paidCount, total: r.list.length })" />
          </span>
          <i class="pi" :class="open === r.no ? 'pi-chevron-up' : 'pi-chevron-down'" />
        </button>
        <div v-if="open === r.no" class="border-t border-[var(--k-border)] px-4 py-3">
          <p class="mb-2 text-xs text-[var(--k-muted)]">{{ t('tt.latePayHint') }}</p>
          <ul class="flex flex-col">
            <li v-for="p in r.list" :key="p.id" class="flex items-center gap-3 py-1.5">
              <Checkbox :model-value="p.paid" binary :input-id="`p-${r.id}-${p.id}`" @update:model-value="(v: boolean) => togglePaid(r.id, p.id, p.due, v)" />
              <label :for="`p-${r.id}-${p.id}`" class="flex-1" :class="{ 'text-[var(--k-muted)] line-through': p.paid }">{{ p.name }}</label>
              <span class="tabular-nums">{{ m(p.due) }}</span>
            </li>
          </ul>
          <div v-if="i === 0 && !openRound" class="mt-2 border-t border-[var(--k-border)] pt-2">
            <Button :label="t('tt.reopenRound')" icon="pi pi-unlock" size="small" text @click="reopen(r)" />
          </div>
        </div>
      </div>
    </section>

    <!-- Excel-like table -->
    <SheetTable v-else-if="tab === 'sheet'" :d="d" :slug="c.name.replace(/[^\p{L}\p{N}]+/gu, '-')" @toggle="togglePaid" />

    <!-- Hands -->
    <section v-else class="flex flex-col gap-3">
      <div class="card overflow-x-auto !p-0">
        <table class="w-full min-w-[34rem] text-sm whitespace-nowrap tabular-nums">
          <thead class="text-left text-[var(--k-muted)]">
            <tr>
              <th class="px-3 py-2 font-normal">#</th>
              <th class="py-2 font-normal">{{ t('tt.name') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.wonRound') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.paidTotal') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.owing') }}</th>
              <th class="py-2 text-right font-normal">{{ t('tt.receivedCol') }}</th>
              <th class="px-3 py-2 text-right font-normal">{{ t('tt.net') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(x, i) in d.members" :key="x.id" class="border-t border-[var(--k-border)]">
              <td class="px-3 py-2 text-[var(--k-muted)]">
                <span class="inline-flex flex-col">
                  <button v-if="c.mode === 'ORDER' && !drawn" type="button" class="leading-none" :aria-label="t('tt.moveUp')" @click="move(i, -1)"><i class="pi pi-angle-up text-xs" /></button>
                  {{ i + 1 }}
                  <button v-if="c.mode === 'ORDER' && !drawn" type="button" class="leading-none" :aria-label="t('tt.moveDown')" @click="move(i, 1)"><i class="pi pi-angle-down text-xs" /></button>
                </span>
              </td>
              <td class="py-2">
                <button type="button" class="text-left font-semibold hover:underline" @click="editHand(x)">{{ x.name }}</button>
                <Tag v-if="x.id === c.head_id" :value="t('tt.head')" severity="info" class="ml-1 !text-[10px]" />
                <a v-if="tel(x.phone)" :href="tel(x.phone)!" class="ml-2 text-primary-600" :aria-label="t('tt.call')"><i class="pi pi-phone text-xs" /></a>
              </td>
              <td class="py-2 text-right">{{ sums[i]?.wonRound ?? '—' }}</td>
              <td class="py-2 text-right">{{ m(sums[i]?.paid ?? 0) }}</td>
              <td class="py-2 text-right" :class="(sums[i]?.owing ?? 0) > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ m(Math.max(0, sums[i]?.owing ?? 0)) }}</td>
              <td class="py-2 text-right">{{ sums[i]?.received ? m(sums[i].received) : '—' }}</td>
              <td class="px-3 py-2 text-right" :class="(sums[i]?.net ?? 0) >= 0 ? 'text-primary-700 dark:text-primary-400' : ''">{{ m(sums[i]?.net ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-[var(--k-muted)]">{{ t('tt.netHint') }}</p>
      <form v-if="!drawn" class="flex gap-2" @submit.prevent="addHand">
        <InputText v-model="newHand" :placeholder="t('tt.addHandPh')" class="flex-1" />
        <Button type="submit" :label="t('tt.addHand')" icon="pi pi-plus" :disabled="!newHand.trim()" />
      </form>
      <p v-else class="text-xs text-[var(--k-muted)]">{{ t('tt.handsLocked') }}</p>
    </section>

    <div class="mt-4 flex flex-wrap gap-2 border-t border-[var(--k-border)] pt-4">
      <Button :label="c.closed_at ? t('tt.reopen') : t('tt.close')" :icon="c.closed_at ? 'pi pi-replay' : 'pi pi-lock'" outlined size="small" @click="toggleClosed" />
      <Button :label="t('tt.delete')" icon="pi pi-trash" text severity="danger" size="small" @click="remove" />
    </div>

    <Dialog v-model:visible="edit.open" modal :header="t('tt.editHand')" class="w-[min(24rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('tt.name') }}</span><InputText v-model="edit.name" /></label>
        <label class="field"><span>{{ t('tt.phone') }}</span><InputText v-model="edit.phone" inputmode="tel" /></label>
        <Button v-if="edit.id !== c.head_id" :label="t('tt.makeHead')" icon="pi pi-star" text size="small" class="self-start" @click="makeHead" />
      </div>
      <template #footer>
        <Button :label="t('tt.remove')" text severity="danger" @click="removeHand" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="edit.open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!edit.name.trim()" @click="saveHand" />
      </template>
    </Dialog>
  </div>
</template>
