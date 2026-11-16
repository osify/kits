<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import PhotoField from '@/components/PhotoField.vue'
import { db } from '../db'
import { deleteRecord, listRecords, saveRecord, type HealthRecord, type RecordKind } from '../db/data'
import { imageUrl } from '@/core/files/images'
import { today } from '@/core/util/date'

/** Vaccines, doctor visits, lab results, prescriptions and notes, with photos and next-due dates. */
const props = defineProps<{ personId: string }>()
const { t } = useI18n()
const rows = ref<HealthRecord[]>([])
const thumbs = ref<Record<string, string>>({})
async function load() {
  rows.value = await listRecords(db, props.personId)
  for (const r of rows.value) if (r.photo && !thumbs.value[r.photo]) thumbs.value[r.photo] = (await imageUrl('health', r.photo)) ?? ''
}
onMounted(load)
const KINDS: RecordKind[] = ['VACCINE', 'VISIT', 'LAB', 'RX', 'NOTE']
const ICON: Record<RecordKind, string> = { VACCINE: 'pi-shield', VISIT: 'pi-user', LAB: 'pi-chart-bar', RX: 'pi-file', NOTE: 'pi-pencil' }
const kindOpts = KINDS.map((k) => ({ label: t(`hl.rec.${k}`), value: k }))

const open = ref(false)
const f = reactive({ id: undefined as string | undefined, kind: 'VACCINE' as RecordKind, date: new Date(), title: '', note: '', photo: null as string | null, next: null as Date | null })
function edit(r?: HealthRecord) {
  Object.assign(f, {
    id: r?.id, kind: r?.kind ?? 'VACCINE', date: r ? new Date(r.date + 'T00:00:00') : new Date(), title: r?.title ?? '', note: r?.note ?? '',
    photo: r?.photo ?? null, next: r?.next_due ? new Date(r.next_due + 'T00:00:00') : null,
  })
  open.value = true
}
async function save() {
  if (!f.title.trim()) return
  await saveRecord(db, { id: f.id, person_id: props.personId, kind: f.kind, date: today(f.date), title: f.title, note: f.note, photo: f.photo, next_due: f.next ? today(f.next) : null })
  open.value = false
  await load()
}
async function remove() {
  await deleteRecord(db, f.id!)
  open.value = false
  await load()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Button :label="t('hl.addRecord')" icon="pi pi-plus" class="self-start" @click="edit()" />
    <p v-if="!rows.length" class="py-6 text-center text-sm text-[var(--k-muted)]">{{ t('hl.noRecords') }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="r in rows" :key="r.id">
        <button type="button" class="card flex w-full items-center gap-3 text-left" @click="edit(r)">
          <img v-if="r.photo && thumbs[r.photo]" :src="thumbs[r.photo]" alt="" class="size-12 shrink-0 rounded-lg object-cover" />
          <i v-else class="pi shrink-0 text-xl text-primary-600" :class="ICON[r.kind]" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ r.title }}</span>
            <span class="block text-xs text-[var(--k-muted)]">
              {{ t(`hl.rec.${r.kind}`) }} · {{ r.date }}<template v-if="r.next_due"> · {{ t('hl.nextDue', { date: r.next_due }) }}</template>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <Dialog v-model:visible="open" modal :header="f.id ? t('hl.editRecord') : t('hl.addRecord')" class="w-[min(28rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="field"><span>{{ t('hl.type') }}</span><Select v-model="f.kind" :options="kindOpts" option-label="label" option-value="value" /></label>
          <label class="field"><span>{{ t('hl.date') }}</span><DatePicker v-model="f.date" date-format="yy-mm-dd" show-icon /></label>
        </div>
        <label class="field"><span>{{ t('hl.recTitle') }}</span><InputText v-model="f.title" :placeholder="t(`hl.recPh.${f.kind}`)" autofocus /></label>
        <label class="field"><span>{{ t('hl.note') }}</span><Textarea v-model="f.note" rows="3" auto-resize /></label>
        <label class="field">
          <span>{{ t('hl.nextDueLabel') }}</span>
          <DatePicker v-model="f.next" date-format="yy-mm-dd" show-icon show-clear />
          <small class="text-[var(--k-muted)]">{{ t('hl.nextDueHint') }}</small>
        </label>
        <div class="field"><span>{{ t('hl.photoDoc') }}</span><PhotoField v-model="f.photo" tool="health" /></div>
      </div>
      <template #footer>
        <Button v-if="f.id" :label="t('hl.delete')" text severity="danger" @click="remove" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.title.trim()" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
