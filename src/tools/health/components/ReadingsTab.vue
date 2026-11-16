<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import LineChart from '@/components/LineChart.vue'
import LevelTag from './LevelTag.vue'
import { db } from '../db'
import { addReading, deleteReading, listReadings, type Reading } from '../db/data'
import { levelOf, mgdlToMmol, mmolToMgdl, UNITS, type Kind } from '../rules'
import { prefs } from '@/core/util/prefs'

/** Measurements for one person: pick a kind, see the trend, add or delete readings. */
const props = defineProps<{ personId: string }>()
const { t } = useI18n()
const KINDS: Kind[] = ['BP', 'GLUCOSE', 'WEIGHT', 'TEMP', 'SPO2', 'PULSE', 'HEIGHT']
const kind = ref<Kind>((prefs.get('health.kind') as Kind) || 'BP')
const rows = ref<Reading[]>([])
const mmol = ref(prefs.get('health.glucoseUnit') === 'mmol')
async function load() {
  rows.value = await listReadings(db, props.personId, kind.value)
}
onMounted(load)
watch(kind, (k) => {
  prefs.set('health.kind', k)
  load()
})
watch(mmol, (v) => prefs.set('health.glucoseUnit', v ? 'mmol' : 'mgdl'))

const kindOpts = computed(() => KINDS.map((k) => ({ label: t(`hl.kind.${k}`), value: k })))
const unit = computed(() => (kind.value === 'GLUCOSE' && mmol.value ? 'mmol/L' : UNITS[kind.value]))
const show = (r: Reading) => {
  if (r.kind === 'BP') return `${r.v1}/${r.v2}`
  if (r.kind === 'GLUCOSE' && mmol.value) return String(mgdlToMmol(r.v1))
  return String(r.v1)
}
const chart = computed(() => {
  const pts = [...rows.value].slice(0, 60).reverse()
  const conv = (v: number) => (kind.value === 'GLUCOSE' && mmol.value ? mgdlToMmol(v) : v)
  if (kind.value === 'BP')
    return {
      series: [
        { label: t('hl.systolic'), points: pts.map((r) => ({ t: r.taken_at, v: r.v1 })) },
        { label: t('hl.diastolic'), points: pts.map((r) => ({ t: r.taken_at, v: r.v2 ?? 0 })) },
      ],
      refs: [{ v: 130, label: '130' }, { v: 80, label: '80' }],
    }
  const refs: Record<string, { v: number; label: string }[]> = {
    GLUCOSE: [{ v: conv(100), label: t('hl.fastingLimit') }],
    TEMP: [{ v: 37.5, label: '37.5' }],
    SPO2: [{ v: 95, label: '95' }],
  }
  return { series: [{ label: t(`hl.kind.${kind.value}`), points: pts.map((r) => ({ t: r.taken_at, v: conv(r.v1) })) }], refs: refs[kind.value] ?? [] }
})
const decimals = computed(() => (['WEIGHT', 'TEMP'].includes(kind.value) || (kind.value === 'GLUCOSE' && mmol.value) ? 1 : 0))

// ── Add ──────────────────────────────────────────────────────────────────────
const open = ref(false)
const f = reactive({ v1: null as number | null, v2: null as number | null, pulse: null as number | null, context: 'FASTING', at: new Date(), note: '' })
function add() {
  Object.assign(f, { v1: null, v2: null, pulse: null, context: 'FASTING', at: new Date(), note: '' })
  open.value = true
}
const ctxOpts = computed(() => ['FASTING', 'AFTER_MEAL', 'RANDOM'].map((c) => ({ label: t(`hl.ctx.${c}`), value: c })))
const valid = computed(() => f.v1 !== null && f.v1 > 0 && (kind.value !== 'BP' || (f.v2 !== null && f.v2 > 0)))
const preview = computed(() => (valid.value ? levelOf(kind.value, kind.value === 'GLUCOSE' && mmol.value ? mmolToMgdl(f.v1!) : f.v1!, f.v2, f.context) : null))
async function save() {
  if (!valid.value) return
  const at = f.at.getTime()
  const v1 = kind.value === 'GLUCOSE' && mmol.value ? mmolToMgdl(f.v1!) : f.v1!
  await addReading(db, { person_id: props.personId, kind: kind.value, v1, v2: kind.value === 'BP' ? f.v2 : null, context: kind.value === 'GLUCOSE' ? f.context : null, taken_at: at, note: f.note })
  if (kind.value === 'BP' && f.pulse) await addReading(db, { person_id: props.personId, kind: 'PULSE', v1: f.pulse, taken_at: at })
  open.value = false
  await load()
}
async function remove(id: string) {
  await deleteReading(db, id)
  await load()
}
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      <button
        v-for="o in kindOpts"
        :key="o.value"
        type="button"
        class="shrink-0 rounded-full border px-3 py-1 text-sm"
        :class="kind === o.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--k-border)]'"
        :aria-pressed="kind === o.value"
        @click="kind = o.value"
      >
        {{ o.label }}
      </button>
    </div>
    <div class="flex items-center gap-2">
      <Button :label="t('hl.addReading')" icon="pi pi-plus" @click="add" />
      <span class="flex-1" />
      <SelectButton
        v-if="kind === 'GLUCOSE'"
        v-model="mmol"
        :options="[{ label: 'mg/dL', value: false }, { label: 'mmol/L', value: true }]"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
      />
    </div>
    <div v-if="rows.length > 1" class="card">
      <LineChart :series="chart.series" :refs="chart.refs" :unit="unit" :decimals="decimals" />
    </div>
    <p v-if="!rows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('hl.noReadings') }}</p>
    <ul v-else class="card flex flex-col divide-y divide-[var(--k-border)] !py-1">
      <li v-for="r in rows" :key="r.id" class="flex items-center gap-3 py-2">
        <span class="min-w-0 flex-1">
          <span class="text-lg font-semibold tabular-nums">{{ show(r) }}</span>
          <span class="ml-1 text-xs text-[var(--k-muted)]">{{ unit }}</span>
          <span class="block text-xs text-[var(--k-muted)]">
            {{ when(r.taken_at) }}<template v-if="r.context"> · {{ t(`hl.ctx.${r.context}`) }}</template><template v-if="r.note"> · {{ r.note }}</template>
          </span>
        </span>
        <LevelTag :level="levelOf(r.kind, r.v1, r.v2, r.context)" />
        <Button icon="pi pi-trash" text rounded severity="secondary" size="small" :aria-label="t('hl.delete')" @click="remove(r.id)" />
      </li>
    </ul>

    <Dialog v-model:visible="open" modal :header="t(`hl.kind.${kind}`)" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <div v-if="kind === 'BP'" class="grid grid-cols-3 gap-2">
          <label class="field"><span>{{ t('hl.systolic') }}</span><InputNumber v-model="f.v1" @input="(e: any) => (f.v1 = e.value)" :min="40" :max="300" input-class="w-full" :pt="{ pcInputText: { root: { autofocus: true, inputmode: 'numeric' } } }" /></label>
          <label class="field"><span>{{ t('hl.diastolic') }}</span><InputNumber v-model="f.v2" @input="(e: any) => (f.v2 = e.value)" :min="20" :max="200" input-class="w-full" /></label>
          <label class="field"><span>{{ t('hl.kind.PULSE') }}</span><InputNumber v-model="f.pulse" @input="(e: any) => (f.pulse = e.value)" :min="20" :max="250" input-class="w-full" /></label>
        </div>
        <label v-else class="field">
          <span>{{ t(`hl.kind.${kind}`) }} ({{ unit }})</span>
          <InputNumber v-model="f.v1" @input="(e: any) => (f.v1 = e.value)" :min-fraction-digits="0" :max-fraction-digits="decimals" input-class="w-full" :pt="{ pcInputText: { root: { autofocus: true, inputmode: 'decimal' } } }" />
        </label>
        <div v-if="kind === 'GLUCOSE'" class="field">
          <span>{{ t('hl.when') }}</span>
          <SelectButton v-model="f.context" :options="ctxOpts" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
        </div>
        <label class="field"><span>{{ t('hl.dateTime') }}</span><DatePicker v-model="f.at" show-time hour-format="24" date-format="yy-mm-dd" show-icon /></label>
        <label class="field"><span>{{ t('hl.note') }}</span><InputText v-model="f.note" /></label>
        <div v-if="preview"><LevelTag :level="preview" /></div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!valid" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
