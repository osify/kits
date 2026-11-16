<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { getDetail, saveCircle } from '../db/data'
import { EVERY, useTongtin } from '../store'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'
import type { Every } from '../rules'

/** New circle (with its hands) or edit a circle's settings. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tt = useTongtin()
const id = route.params.id as string | undefined
const f = reactive({
  name: '',
  currency: 'KHR' as 'KHR' | 'USD',
  amount: 100_000,
  start: new Date(),
  every: 'MONTH' as Every,
  mode: 'BID' as 'BID' | 'ORDER',
  head_first: true,
  note: '',
  members: '',
})
const drawn = ref(0)
onMounted(async () => {
  if (!id) return
  const d = await getDetail(db, id)
  if (!d) return void router.replace('/')
  const c = d.circle
  Object.assign(f, { name: c.name, currency: c.currency, amount: c.amount, start: new Date(c.start_date + 'T00:00:00'), every: c.every, mode: c.mode, head_first: !!c.head_first, note: c.note ?? '' })
  drawn.value = d.rounds.length
})
const names = computed(() => f.members.split('\n').map((s) => s.trim()).filter(Boolean))
const locked = computed(() => drawn.value > 0)
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
const everyOpts = computed(() => EVERY.map((e) => ({ label: t(`tt.every.${e}`), value: e })))
const modeOpts = computed(() => (['BID', 'ORDER'] as const).map((m) => ({ label: t(`tt.mode.${m}`), value: m })))
const valid = computed(() => f.name.trim() && f.amount > 0 && (id || names.value.length >= 2))

async function save() {
  if (!valid.value) return
  const cid = await saveCircle(
    db,
    { id, name: f.name.trim(), currency: f.currency, amount: f.amount, start_date: today(f.start), every: f.every, mode: f.mode, head_first: f.head_first, note: f.note.trim() || null },
    id ? [] : names.value,
  )
  await tt.load()
  router.replace(`/c/${cid}`)
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div class="flex items-center gap-2">
      <Button icon="pi pi-arrow-left" text rounded :aria-label="t('common.back')" @click="router.back()" />
      <h1 class="text-xl font-semibold">{{ id ? t('tt.editCircle') : t('tt.newCircle') }}</h1>
    </div>
    <section class="card flex flex-col gap-3">
      <label class="field"><span>{{ t('tt.circleName') }}</span><InputText v-model="f.name" :placeholder="t('tt.circleNamePh')" autofocus /></label>
      <Message v-if="locked" severity="secondary" :closable="false" class="text-sm">{{ t('tt.lockedAfterDraw') }}</Message>
      <div class="field">
        <span>{{ t('tt.amount') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.amount" :currency="f.currency" class="flex-1" :disabled="locked" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" :disabled="locked" />
        </div>
        <small class="text-[var(--k-muted)]">{{ t('tt.amountHint') }}</small>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('tt.start') }}</span><DatePicker v-model="f.start" date-format="yy-mm-dd" show-icon :disabled="locked" /></label>
        <label class="field"><span>{{ t('tt.everyLabel') }}</span><Select v-model="f.every" :options="everyOpts" option-label="label" option-value="value" :disabled="locked" /></label>
      </div>
      <div class="field">
        <span>{{ t('tt.modeLabel') }}</span>
        <SelectButton v-model="f.mode" :options="modeOpts" option-label="label" option-value="value" :allow-empty="false" :disabled="locked" />
        <small class="text-[var(--k-muted)]">{{ t(`tt.modeHint.${f.mode}`) }}</small>
      </div>
      <label v-if="f.mode === 'BID'" class="flex items-start gap-2 text-sm">
        <ToggleSwitch v-model="f.head_first" :disabled="locked" />
        <span>{{ t('tt.headFirst') }}<br /><small class="text-[var(--k-muted)]">{{ t('tt.headFirstHint') }}</small></span>
      </label>
      <label v-if="!id" class="field">
        <span>{{ t('tt.membersLabel') }}</span>
        <Textarea v-model="f.members" rows="6" auto-resize :placeholder="t('tt.membersPh')" />
        <small class="text-[var(--k-muted)]">
          {{ t('tt.membersHint') }}
          <template v-if="names.length >= 2"> · {{ t('tt.potPreview', { n: names.length, pot: formatMoney(f.amount * (names.length - 1), f.currency) }) }}</template>
        </small>
      </label>
      <label class="field"><span>{{ t('tt.note') }} <small class="text-[var(--k-muted)]">({{ t('tt.optional') }})</small></span><Textarea v-model="f.note" rows="2" auto-resize /></label>
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!valid" class="self-start" @click="save" />
    </section>
  </div>
</template>
