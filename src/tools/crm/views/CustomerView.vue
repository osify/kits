<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import CustomerForm from '../components/CustomerForm.vue'
import EntryDialog from '../components/EntryDialog.vue'
import { db, dbState } from '../db'
import { archiveCustomer, completeFollowup, deleteEntry, getCustomer, tagList, timeline, type CustomerRow, type EntryMode, type TimelineRow } from '../db/data'
import { useCrm, telLink, tgLink } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const crm = useCrm()
const id = computed(() => route.params.id as string)
const c = ref<CustomerRow | null>(null)
const items = ref<TimelineRow[]>([])

async function load() {
  c.value = (await getCustomer(db, id.value)) ?? null
  items.value = c.value ? await timeline(db, id.value) : []
}
watch([id, () => crm.version], load, { immediate: true })

const formOpen = ref(false)
const entryOpen = ref(false)
const entryMode = ref<EntryMode>('activity')
function entry(m: EntryMode) {
  entryMode.value = m
  entryOpen.value = true
}
async function changed() {
  await crm.load()
}
function remove(x: TimelineRow) {
  confirm.require({
    header: t('common.delete'),
    message: t('crm.deleteEntry'),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteEntry(db, x.type, x.id)
      await crm.load()
    },
  })
}
function archive() {
  if (!c.value) return
  confirm.require({
    header: t('crm.archive'),
    message: t('crm.archiveConfirm', { name: c.value.name }),
    acceptProps: { label: t('crm.archive'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await archiveCustomer(db, id.value)
      await crm.load()
      router.replace('/list')
    },
  })
}
async function done(x: TimelineRow) {
  await completeFollowup(db, x.id, dbState.deviceId)
  await crm.load()
}

const icon = (x: TimelineRow) =>
  x.type === 'ledger'
    ? x.kind === 'CHARGE'
      ? 'pi pi-arrow-up-right text-amber-600'
      : 'pi pi-arrow-down-left text-primary-600'
    : x.type === 'followup'
      ? x.done_at
        ? 'pi pi-check-circle text-primary-600'
        : 'pi pi-bell text-amber-600'
      : { CALL: 'pi pi-phone', VISIT: 'pi pi-map-marker', MESSAGE: 'pi pi-comment', SALE: 'pi pi-shopping-bag', NOTE: 'pi pi-pencil' }[x.kind] + ' text-[var(--k-muted)]'
const label = (x: TimelineRow) =>
  x.type === 'ledger' ? t(`crm.ledger.${x.kind}`) : x.type === 'followup' ? (x.done_at ? t('crm.followupDone') : t('crm.followupFor', { date: x.date })) : t(`crm.kind.${x.kind}`)
</script>

<template>
  <div v-if="c" class="flex flex-col gap-4">
    <div class="flex items-start gap-3">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.back()" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ c.name }}</h1>
        <div class="flex flex-wrap gap-1 text-xs">
          <span v-for="x in tagList(c.tags)" :key="x" class="rounded bg-[var(--k-border)]/60 px-1.5">{{ x }}</span>
        </div>
      </div>
      <Button icon="pi pi-pencil" text rounded :aria-label="t('common.edit')" @click="formOpen = true" />
    </div>

    <section class="card grid gap-2 text-sm sm:grid-cols-2">
      <div v-if="c.phone" class="flex items-center gap-2">
        <i class="pi pi-phone text-[var(--k-muted)]" />
        <a :href="telLink(c.phone)!" class="text-primary-600 underline dark:text-primary-400">{{ c.phone }}</a>
      </div>
      <div v-if="c.telegram" class="flex items-center gap-2">
        <i class="pi pi-telegram text-[var(--k-muted)]" />
        <a :href="tgLink(c.telegram)!" target="_blank" rel="noopener" class="text-primary-600 underline dark:text-primary-400">@{{ c.telegram }}</a>
      </div>
      <div v-if="c.address" class="flex items-center gap-2"><i class="pi pi-map-marker text-[var(--k-muted)]" />{{ c.address }}</div>
      <div v-if="c.birthday" class="flex items-center gap-2"><span aria-hidden="true">🎂</span>{{ c.birthday }}</div>
      <p v-if="c.note" class="text-[var(--k-muted)] sm:col-span-2">{{ c.note }}</p>
    </section>

    <section class="card flex flex-wrap items-center gap-4">
      <div class="flex-1">
        <div class="text-sm text-[var(--k-muted)]">{{ t('crm.owes') }}</div>
        <div class="text-2xl font-bold tabular-nums" :class="{ 'text-amber-700 dark:text-amber-400': c.owe_khr > 0 || c.owe_usd > 0 }">
          {{ formatMoney(c.owe_khr, 'KHR') }}<template v-if="c.owe_usd"> + {{ formatMoney(c.owe_usd, 'USD') }}</template>
        </div>
      </div>
      <Button :label="t('crm.entry.payment')" icon="pi pi-arrow-down-left" outlined @click="entry('payment')" />
      <Button :label="t('crm.entry.charge')" icon="pi pi-arrow-up-right" outlined severity="warn" @click="entry('charge')" />
    </section>

    <div class="grid grid-cols-2 gap-2">
      <Button :label="t('crm.entry.activity')" icon="pi pi-pencil" @click="entry('activity')" />
      <Button :label="t('crm.entry.followup')" icon="pi pi-bell" severity="secondary" @click="entry('followup')" />
    </div>

    <section>
      <h2 class="mb-2 font-semibold">{{ t('crm.history') }}</h2>
      <p v-if="!items.length" class="text-sm text-[var(--k-muted)]">{{ t('crm.noHistory') }}</p>
      <ul v-else class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <li v-for="x in items" :key="x.type + x.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
          <i :class="icon(x)" />
          <span class="min-w-0 flex-1">
            <span class="block">{{ label(x) }}<span v-if="x.note" class="text-[var(--k-muted)]"> · {{ x.note }}</span></span>
            <span class="text-xs text-[var(--k-muted)]">{{ x.date }}</span>
          </span>
          <span v-if="x.type === 'ledger'" class="font-semibold tabular-nums">{{ x.kind === 'CHARGE' ? '+' : '−' }}{{ formatMoney(x.amount!, x.currency!) }}</span>
          <Button v-if="x.type === 'followup' && !x.done_at" :label="t('crm.done')" size="small" text @click="done(x)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="t('common.delete')" @click="remove(x)" />
        </li>
      </ul>
    </section>

    <Button :label="t('crm.archive')" text severity="secondary" class="self-start" @click="archive" />
    <CustomerForm v-model:visible="formOpen" :customer="c" @saved="changed" />
    <EntryDialog v-model:visible="entryOpen" :customer-id="c.id" :mode="entryMode" @saved="changed" />
  </div>
  <p v-else class="py-10 text-center text-[var(--k-muted)]">{{ t('crm.notFound') }}</p>
</template>
