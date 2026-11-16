<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import AutoComplete from 'primevue/autocomplete'
import Checkbox from 'primevue/checkbox'
import { db } from '../db'
import { addLine, saveRx, type RxItemRow } from '../db/data'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'

/** Add or edit one prescription line. Medicines from the price list can also be added to the fees. */
const props = defineProps<{ visitId: string; item?: RxItemRow | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const cl = useClinic()
const f = reactive({ name: '', dose: '', times: null as number | null, days: null as number | null, qty: null as number | null, unit: '', note: '', charge: false })
const meds = computed(() => cl.services.filter((s) => s.kind === 'MEDICINE'))
const suggestions = reactive({ list: [] as string[] })
watch(open, (v) => {
  if (!v) return
  const i = props.item
  Object.assign(f, { name: i?.name ?? '', dose: i?.dose ?? '', times: i?.times ?? null, days: i?.days ?? null, qty: i?.qty ?? null, unit: i?.unit ?? '', note: i?.note ?? '', charge: false })
})
const priced = computed(() => meds.value.find((s) => s.name.toLowerCase() === f.name.trim().toLowerCase()) ?? null)
watch(priced, (s) => {
  if (s && !f.unit) f.unit = s.unit ?? ''
  f.charge = !!s && !props.item
})
const autoQty = computed(() => (f.times && f.days ? f.times * f.days : null))
function search(e: { query: string }) {
  const q = e.query.toLowerCase()
  suggestions.list = meds.value.map((s) => s.name).filter((n) => n.toLowerCase().includes(q))
}
async function save() {
  if (!f.name.trim()) return
  const qty = f.qty ?? autoQty.value
  await saveRx(db, props.visitId, { id: props.item?.id, name: f.name, dose: f.dose, times: f.times, days: f.days, qty, unit: f.unit, note: f.note })
  if (f.charge && priced.value) await addLine(db, props.visitId, { service_id: priced.value.id, name: priced.value.name, qty: qty ?? 1, price: priced.value.price })
  open.value = false
  emit('saved')
}
const TIMES = [1, 2, 3, 4]
</script>

<template>
  <Dialog v-model:visible="open" modal :header="item ? t('cl.editRx') : t('cl.addRx')" class="w-[min(28rem,calc(100vw-1rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <label class="field">
        <span>{{ t('cl.medicine') }}</span>
        <AutoComplete v-model="f.name" :suggestions="suggestions.list" input-class="w-full" class="w-full" :placeholder="t('cl.medicinePh')" dropdown :show-empty-message="false" :pt="{ pcInputText: { root: { autofocus: true } } }" @complete="search" />
      </label>
      <label class="field"><span>{{ t('hl.dose') }}</span><InputText v-model="f.dose" :placeholder="t('hl.dosePh')" /></label>
      <div class="field">
        <span>{{ t('cl.timesPerDay') }}</span>
        <div class="flex flex-wrap gap-1">
          <Button v-for="n in TIMES" :key="n" :label="t('cl.timesDay', { n })" size="small" :outlined="f.times !== n" @click="f.times = n" />
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <label class="field"><span>{{ t('cl.days') }}</span><InputNumber v-model="f.days" :min="1" :max="365" input-class="w-full" @input="(e: any) => (f.days = e.value)" /></label>
        <label class="field">
          <span>{{ t('cl.qty') }}</span>
          <InputNumber v-model="f.qty" :min="0" :max="9999" :placeholder="autoQty ? String(autoQty) : ''" input-class="w-full" @input="(e: any) => (f.qty = e.value)" />
        </label>
        <label class="field"><span>{{ t('cl.unit') }}</span><InputText v-model="f.unit" :placeholder="t('cl.unitPh')" /></label>
      </div>
      <label class="field"><span>{{ t('hl.note') }}</span><InputText v-model="f.note" :placeholder="t('hl.medNotePh')" /></label>
      <label v-if="priced && !item" class="flex items-center gap-2 text-sm">
        <Checkbox v-model="f.charge" binary />
        {{ t('cl.chargeMed', { price: formatMoney(priced.price, cl.currency), unit: priced.unit || '' }) }}
      </label>
      <div class="flex justify-end gap-2">
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" />
      </div>
    </form>
  </Dialog>
</template>
