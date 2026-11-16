<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ScanCode from '@/components/ScanCode.vue'
import { decodeKx, type RxPayload } from '@/core/exchange/codec'
import { db } from '../db'
import { deleteMedicine, listMedicines, saveMedicine, saveRecord, type Medicine } from '../db/data'
import { timesOf } from '../rules'
import { today } from '@/core/util/date'

/** A person's medicines: name, dose, times each day, from/to dates. */
const props = defineProps<{ personId: string }>()
const { t } = useI18n()
const confirm = useConfirm()
const rows = ref<Medicine[]>([])
const load = async () => (rows.value = await listMedicines(db, props.personId))
onMounted(load)
const todayStr = today()
const status = (m: Medicine) => (!m.active || (m.end_date && m.end_date < todayStr) ? 'done' : m.start_date > todayStr ? 'later' : 'now')

const open = ref(false)
const PRESETS = [
  { key: 'once', times: ['08:00'] },
  { key: 'twice', times: ['08:00', '20:00'] },
  { key: 'three', times: ['07:00', '12:00', '19:00'] },
  { key: 'four', times: ['07:00', '12:00', '17:00', '21:00'] },
]
const f = reactive({ id: '' as string | undefined, name: '', dose: '', times: ['08:00'] as string[], start: new Date(), end: null as Date | null, note: '', active: true })
function edit(m?: Medicine) {
  Object.assign(f, {
    id: m?.id, name: m?.name ?? '', dose: m?.dose ?? '', times: m ? timesOf(m.times) : ['08:00'], start: m ? new Date(m.start_date + 'T00:00:00') : new Date(),
    end: m?.end_date ? new Date(m.end_date + 'T00:00:00') : null, note: m?.note ?? '', active: m ? !!m.active : true,
  })
  open.value = true
}
const cleanTimes = computed(() => timesOf(f.times.join(',')))
async function save() {
  if (!f.name.trim() || !cleanTimes.value.length) return
  await saveMedicine(db, {
    id: f.id, person_id: props.personId, name: f.name, dose: f.dose, times: cleanTimes.value.join(','), start_date: today(f.start),
    end_date: f.end ? today(f.end) : null, note: f.note, active: f.active ? 1 : 0,
  })
  open.value = false
  await load()
}
function remove() {
  confirm.require({
    message: t('hl.deleteMedConfirm', { name: f.name }),
    acceptProps: { label: t('hl.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteMedicine(db, f.id!)
      open.value = false
      await load()
    },
  })
}
/** Course length shortcut: ends N days after the start (inclusive). */
function days(n: number) {
  const d = new Date(f.start)
  d.setDate(d.getDate() + n - 1)
  f.end = d
}

// ── Import a clinic prescription (Kitroid code) as a medicine schedule ─────
const toast = useToast()
const scanning = ref(false)
const rx = ref<RxPayload | null>(null)
const rxErr = ref('')
const TIMES_BY_COUNT: Record<number, string[]> = { 1: ['08:00'], 2: ['08:00', '20:00'], 3: ['07:00', '12:00', '19:00'], 4: ['07:00', '12:00', '17:00', '21:00'] }
function onCode(text: string) {
  rxErr.value = ''
  try {
    const d = decodeKx(text)
    if (d.type !== 'rx') throw new Error('UNKNOWN_TYPE')
    rx.value = d.data
  } catch (e: any) {
    rx.value = null
    rxErr.value = t(`kx.err.${e.message}`, t('kx.err.BAD_CODE'))
    toast.add({ severity: 'error', summary: rxErr.value, life: 4000 })
  }
}
async function importRx() {
  if (!rx.value) return
  const start = new Date()
  for (const i of rx.value.items) {
    const end = i.days ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + i.days - 1) : null
    await saveMedicine(db, {
      person_id: props.personId,
      name: i.n,
      dose: i.d ?? '',
      times: (TIMES_BY_COUNT[Math.min(4, Math.max(1, i.t ?? 1))] ?? ['08:00']).join(','),
      start_date: today(start),
      end_date: end ? today(end) : null,
      note: [i.note, rx.value.clinic].filter(Boolean).join(' · '),
    })
  }
  await saveRecord(db, {
    person_id: props.personId,
    kind: 'RX',
    date: rx.value.date,
    title: `${rx.value.clinic}${rx.value.doctor ? ` · ${rx.value.doctor}` : ''}`,
    note: rx.value.items.map((i) => `${i.n}${i.d ? ` — ${i.d}` : ''}${i.t ? ` × ${i.t}/d` : ''}${i.days ? `, ${i.days} d` : ''}`).join(String.fromCharCode(10)),
  })
  toast.add({ severity: 'success', summary: t('kx.medsAdded', { n: rx.value.items.length }), life: 3000 })
  rx.value = null
  await load()
}
defineExpose({ edit, load })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <Button :label="t('hl.addMedicine')" icon="pi pi-plus" @click="edit()" />
      <Button :label="t('kx.scanRx')" icon="pi pi-qrcode" outlined @click="scanning = true" />
    </div>
    <ScanCode v-model:open="scanning" :title="t('kx.scanRx')" @code="onCode" />
    <Dialog :visible="!!rx" modal :header="t('kx.rxTitle')" class="w-[min(28rem,calc(100vw-1rem))]" @update:visible="(v: boolean) => !v && (rx = null)">
      <div v-if="rx" class="flex flex-col gap-2 text-sm">
        <p class="font-semibold">{{ rx.clinic }}<template v-if="rx.doctor"> · {{ rx.doctor }}</template> · {{ rx.date }}</p>
        <ul class="flex flex-col divide-y divide-[var(--k-border)]">
          <li v-for="(i, k) in rx.items" :key="k" class="py-1.5">
            <b>{{ i.n }}</b>
            <span class="block text-xs text-[var(--k-muted)]">{{ [i.d, i.t ? t('cl.timesDay', { n: i.t }) : '', i.days ? t('cl.forDays', { n: i.days }) : '', i.note].filter(Boolean).join(' · ') }}</span>
          </li>
        </ul>
        <p class="text-xs text-[var(--k-muted)]">{{ t('kx.importHint') }}</p>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="rx = null" />
        <Button :label="t('kx.importMeds')" icon="pi pi-check" @click="importRx" />
      </template>
    </Dialog>
    <p v-if="!rows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('hl.noMedicines') }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="m in rows" :key="m.id">
        <button type="button" class="card flex w-full items-center gap-3 text-left" :class="{ 'opacity-60': status(m) === 'done' }" @click="edit(m)">
          <i class="pi pi-box text-xl text-primary-600" />
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">{{ m.name }} <span v-if="m.dose" class="font-normal text-[var(--k-muted)]">· {{ m.dose }}</span></span>
            <span class="block text-xs text-[var(--k-muted)]">
              {{ timesOf(m.times).join(' · ') }} · {{ m.start_date }}{{ m.end_date ? ` → ${m.end_date}` : ` → ${t('hl.ongoing')}` }}
            </span>
          </span>
          <Tag :severity="status(m) === 'now' ? 'success' : 'secondary'" :value="t(`hl.medStatus.${status(m)}`)" />
        </button>
      </li>
    </ul>

    <Dialog v-model:visible="open" modal :header="f.id ? t('hl.editMedicine') : t('hl.addMedicine')" class="w-[min(28rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('hl.medName') }}</span><InputText v-model="f.name" autofocus /></label>
        <label class="field"><span>{{ t('hl.dose') }}</span><InputText v-model="f.dose" :placeholder="t('hl.dosePh')" /></label>
        <div class="field">
          <span>{{ t('hl.times') }}</span>
          <div class="flex flex-wrap gap-1">
            <Button v-for="p in PRESETS" :key="p.key" :label="t(`hl.preset.${p.key}`)" size="small" :outlined="f.times.join() !== p.times.join()" @click="f.times = [...p.times]" />
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <span v-for="(tm, i) in f.times" :key="i" class="inline-flex items-center gap-1">
              <input v-model="f.times[i]" type="time" class="rounded-lg border border-[var(--k-border)] bg-transparent px-2 py-1" :aria-label="`${t('hl.times')} ${i + 1}`" />
              <button v-if="f.times.length > 1" type="button" class="text-[var(--k-muted)]" :aria-label="t('hl.delete')" @click="f.times.splice(i, 1)"><i class="pi pi-times text-xs" /></button>
            </span>
            <Button icon="pi pi-plus" text rounded size="small" :aria-label="t('hl.addTime')" @click="f.times.push('12:00')" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="field"><span>{{ t('hl.from') }}</span><DatePicker v-model="f.start" date-format="yy-mm-dd" show-icon /></label>
          <label class="field"><span>{{ t('hl.to') }}</span><DatePicker v-model="f.end" date-format="yy-mm-dd" show-icon show-clear :placeholder="t('hl.ongoing')" /></label>
        </div>
        <div class="flex flex-wrap gap-1">
          <Button v-for="n in [3, 5, 7, 14, 30]" :key="n" :label="t('hl.forDays', { n })" size="small" text @click="days(n)" />
        </div>
        <label class="field"><span>{{ t('hl.note') }}</span><InputText v-model="f.note" :placeholder="t('hl.medNotePh')" /></label>
        <label v-if="f.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.active" /> {{ t('hl.stillTaking') }}</label>
      </div>
      <template #footer>
        <Button v-if="f.id" :label="t('hl.delete')" text severity="danger" @click="remove" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim() || !cleanTimes.length" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
