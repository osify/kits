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
import { db } from '../db'
import {
  getDetail, saveRound, deleteLastRound, setPaid, payAll, saveMember, deleteMember, reorderMembers, setHead, setCircleClosed, deleteCircle,
  type CircleDetail, type Member,
} from '../db/data'
import { dues, potOf, roundDate, liveBefore, summary } from '../rules'
import { useTongtin } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** One circle: draw the next round, tick who paid, hands and their totals. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const tt = useTongtin()
const id = route.params.id as string
const d = ref<CircleDetail | null>(null)
const tab = ref<'rounds' | 'hands'>('rounds')
const open = ref<number | null>(null) // expanded round

async function load() {
  d.value = await getDetail(db, id)
  if (!d.value) return void router.replace('/')
  resetNext()
}
onMounted(load)
watch(() => tt.version, load)

const c = computed(() => d.value!.circle)
const m = (v: number) => formatMoney(v, c.value.currency)
const nameOf = (mid: string | null) => d.value?.members.find((x) => x.id === mid)?.name ?? '?'
const hands = computed(() => d.value?.members.length ?? 0)
const drawn = computed(() => d.value?.rounds.length ?? 0)
const finished = computed(() => hands.value > 0 && drawn.value >= hands.value)
const nextNo = computed(() => drawn.value + 1)
const live = computed(() => (d.value ? liveBefore(d.value.members, d.value.rounds, nextNo.value) : []))
const headRound = computed(() => !!d.value && c.value.mode === 'BID' && !!c.value.head_first && nextNo.value === 1)
const sums = computed(() => (d.value ? summary(c.value, d.value.members, d.value.rounds, d.value.payments) : []))
const totalOwing = computed(() => sums.value.reduce((s, r) => s + Math.max(0, r.owing), 0))

// ── Next round ───────────────────────────────────────────────────────────────
const next = reactive({ date: new Date(), winner: '' as string, bid: 0 })
function resetNext() {
  if (!d.value) return
  next.date = new Date(roundDate(c.value.start_date, c.value.every, nextNo.value) + 'T00:00:00')
  next.bid = 0
  if (headRound.value && c.value.head_id && live.value.some((x) => x.id === c.value.head_id)) next.winner = c.value.head_id
  else if (c.value.mode === 'ORDER') next.winner = live.value[0]?.id ?? ''
  else next.winner = ''
}
const preview = computed(() => {
  if (!d.value || !next.winner) return null
  const due = dues(c.value, d.value.members, d.value.rounds, nextNo.value, next.winner, next.bid)
  const vals = [...due.values()]
  return { pot: potOf(due), livePay: Math.min(...vals), deadPay: Math.max(...vals), dead: vals.filter((v) => v === c.value.amount).length }
})
const winnerOpts = computed(() => live.value.map((x) => ({ label: x.name + (x.id === c.value.head_id ? ` (${t('tt.head')})` : ''), value: x.id })))
async function draw() {
  if (!next.winner) return
  await saveRound(db, { circle_id: id, no: nextNo.value, date: today(next.date), winner_id: next.winner, bid: headRound.value || c.value.mode === 'ORDER' ? 0 : next.bid })
  open.value = nextNo.value
  await load()
  toast.add({ severity: 'success', summary: t('tt.drawn', { name: nameOf(d.value!.rounds.at(-1)!.winner_id) }), life: 2500 })
}

// ── Rounds ───────────────────────────────────────────────────────────────────
const roundRows = computed(() =>
  (d.value?.rounds ?? [])
    .map((r) => {
      const due = dues(c.value, d.value!.members, d.value!.rounds, r.no, r.winner_id, r.bid)
      const paid = new Map(d.value!.payments.filter((p) => p.round_id === r.id).map((p) => [p.member_id, p.amount]))
      const payers = [...due].map(([mid, v]) => ({ id: mid, name: nameOf(mid), due: v, paid: paid.has(mid) }))
      return { ...r, pot: potOf(due), payers, paidCount: payers.filter((p) => p.paid).length, collected: payers.filter((p) => p.paid).reduce((s, p) => s + p.due, 0) }
    })
    .reverse(),
)
async function togglePaid(roundId: string, mid: string, due: number, paid: boolean) {
  await setPaid(db, roundId, mid, paid ? due : null)
  await load()
}
async function allPaid(no: number) {
  await payAll(db, id, no)
  await load()
}
function undoLast() {
  confirm.require({
    message: t('tt.undoConfirm', { n: drawn.value }),
    acceptProps: { label: t('tt.undo'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteLastRound(db, id)
      await load()
    },
  })
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
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('tt.progress') }}</div><div class="text-lg font-semibold">{{ drawn }} / {{ hands }}</div></div>
      <div class="card"><div class="text-xs text-[var(--k-muted)]">{{ t('tt.fullPot') }}</div><div class="text-lg font-semibold tabular-nums">{{ m(c.amount * Math.max(0, hands - 1)) }}</div></div>
      <div class="card">
        <div class="text-xs text-[var(--k-muted)]">{{ t('tt.owing') }}</div>
        <div class="text-lg font-semibold tabular-nums" :class="totalOwing ? 'text-amber-700 dark:text-amber-400' : ''">{{ m(totalOwing) }}</div>
      </div>
    </div>

    <Message v-if="c.closed_at" severity="secondary" :closable="false">{{ t('tt.closedNote') }}</Message>
    <Message v-else-if="finished" severity="success" :closable="false">{{ t('tt.finishedNote') }}</Message>
    <Message v-else-if="hands < 2" severity="warn" :closable="false">{{ t('tt.needHands') }}</Message>

    <!-- Next round -->
    <section v-if="!c.closed_at && !finished && hands >= 2" class="card flex flex-col gap-3 border-primary-300 dark:border-primary-800">
      <h2 class="font-semibold">{{ t('tt.nextRound', { n: nextNo }) }}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="field"><span>{{ t('tt.date') }}</span><DatePicker v-model="next.date" date-format="yy-mm-dd" show-icon /></label>
        <label class="field">
          <span>{{ c.mode === 'BID' && !headRound ? t('tt.winnerBid') : t('tt.winner') }}</span>
          <Select v-model="next.winner" :options="winnerOpts" option-label="label" option-value="value" :placeholder="t('tt.pickWinner')" :disabled="headRound" filter />
        </label>
        <label v-if="c.mode === 'BID' && !headRound" class="field">
          <span>{{ t('tt.bid') }}</span>
          <AmountField v-model="next.bid" :currency="c.currency" />
        </label>
      </div>
      <p v-if="headRound" class="text-sm text-[var(--k-muted)]">{{ t('tt.headRoundNote') }}</p>
      <div v-if="preview" class="rounded-lg bg-primary-50 p-3 text-sm dark:bg-primary-950/50">
        <div class="text-base">{{ t('tt.receives', { name: nameOf(next.winner) }) }} <b class="tabular-nums">{{ m(preview.pot) }}</b></div>
        <div class="mt-1 text-[var(--k-muted)]">
          {{ t('tt.livePay', { amount: m(preview.livePay) }) }}<template v-if="preview.dead && preview.deadPay !== preview.livePay"> · {{ t('tt.deadPay', { amount: m(preview.deadPay), n: preview.dead }) }}</template>
        </div>
      </div>
      <Button :label="t('tt.record')" icon="pi pi-check" class="self-start" :disabled="!next.winner || next.bid > c.amount" @click="draw" />
    </section>

    <SelectButton v-model="tab" :options="tabs" option-label="label" option-value="value" :allow-empty="false" class="self-start" />

    <!-- Rounds -->
    <section v-if="tab === 'rounds'" class="flex flex-col gap-2">
      <p v-if="!roundRows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('tt.noRounds') }}</p>
      <div v-for="(r, i) in roundRows" :key="r.id" class="card !p-0">
        <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" :aria-expanded="open === r.no" @click="open = open === r.no ? null : r.no">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">{{ r.no }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ nameOf(r.winner_id) }}</span>
            <span class="block text-xs text-[var(--k-muted)]">{{ r.date }}<template v-if="r.bid"> · {{ t('tt.bidShort', { amount: m(r.bid) }) }}</template></span>
          </span>
          <span class="text-right">
            <span class="block font-semibold tabular-nums">{{ m(r.pot) }}</span>
            <Tag :severity="r.paidCount === r.payers.length ? 'success' : 'warn'" :value="t('tt.paidCount', { n: r.paidCount, total: r.payers.length })" />
          </span>
          <i class="pi" :class="open === r.no ? 'pi-chevron-up' : 'pi-chevron-down'" />
        </button>
        <div v-if="open === r.no" class="border-t border-[var(--k-border)] px-4 py-3">
          <ul class="flex flex-col">
            <li v-for="p in r.payers" :key="p.id" class="flex items-center gap-3 py-1.5">
              <Checkbox :model-value="p.paid" binary :input-id="`p-${r.id}-${p.id}`" @update:model-value="(v: boolean) => togglePaid(r.id, p.id, p.due, v)" />
              <label :for="`p-${r.id}-${p.id}`" class="flex-1" :class="{ 'text-[var(--k-muted)] line-through': p.paid }">{{ p.name }}</label>
              <span class="tabular-nums">{{ m(p.due) }}</span>
            </li>
          </ul>
          <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--k-border)] pt-2 text-sm">
            <span class="flex-1">{{ t('tt.collected', { got: m(r.collected), pot: m(r.pot) }) }}</span>
            <Button v-if="r.paidCount < r.payers.length" :label="t('tt.allPaid')" icon="pi pi-check-square" size="small" outlined @click="allPaid(r.no)" />
            <Button v-if="i === 0" :label="t('tt.undo')" icon="pi pi-undo" size="small" text severity="danger" @click="undoLast" />
          </div>
        </div>
      </div>
    </section>

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
