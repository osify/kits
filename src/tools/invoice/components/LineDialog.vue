<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { addLine, lineAmount, removeLine, saveItem, updateLine, type Line } from '../db/data'
import { useInvoice } from '../store'
import { centsToRiel, formatMoney, rielToCents, type Currency } from '@/core/util/money'

/** Add or edit one line of a document. Picking a saved item fills name, unit and price (converted at the document's rate). */
const props = defineProps<{ docId: string; line?: Line | null; currency: Currency; rate: number }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const iv = useInvoice()
const f = reactive({ item_id: null as string | null, name: '', detail: '', unit: '', qty: 1 as number | null, price: 0, keep: false })
watch(open, (v) => {
  if (!v) return
  const l = props.line
  Object.assign(f, { item_id: l?.item_id ?? null, name: l?.name ?? '', detail: l?.detail ?? '', unit: l?.unit ?? '', qty: l?.qty ?? 1, price: l?.price ?? 0, keep: false })
})
const itemOpts = computed(() => iv.items.map((i) => ({ value: i.id, label: `${i.name} · ${formatMoney(i.price, i.currency)}${i.unit ? ` / ${i.unit}` : ''}` })))
function pick(id: string | null) {
  f.item_id = id
  const i = iv.items.find((x) => x.id === id)
  if (!i) return
  f.name = i.name
  f.unit = i.unit ?? ''
  f.price = i.currency === props.currency ? i.price : props.currency === 'USD' ? rielToCents(i.price, props.rate) : centsToRiel(i.price, props.rate)
}
const amount = computed(() => lineAmount({ qty: f.qty ?? 0, price: f.price }, props.currency))
const valid = computed(() => !!f.name.trim() && (f.qty ?? 0) > 0)
async function save() {
  if (!valid.value) return
  const v = { name: f.name, detail: f.detail, unit: f.unit, qty: f.qty ?? 1, price: f.price }
  if (props.line) await updateLine(db, props.line.id, v)
  else await addLine(db, props.docId, { ...v, item_id: f.item_id })
  if (f.keep && !f.item_id) {
    await saveItem(db, { name: f.name, unit: f.unit, price: f.price, currency: props.currency })
    await iv.load()
  }
  open.value = false
  emit('saved')
}
async function remove() {
  if (!props.line) return
  await removeLine(db, props.line.id)
  open.value = false
  emit('saved')
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="line ? t('iv.editLine') : t('iv.addLine')" class="w-[min(32rem,calc(100vw-1rem))]">
    <div class="flex flex-col gap-3">
      <label v-if="!line && itemOpts.length" class="field">
        <span>{{ t('iv.fromItems') }}</span>
        <Select :model-value="f.item_id" :options="itemOpts" option-label="label" option-value="value" filter :placeholder="t('iv.pickItem')" show-clear @update:model-value="pick" />
      </label>
      <label class="field"><span>{{ t('iv.description') }}</span><InputText v-model="f.name" autofocus /></label>
      <label class="field"><span>{{ t('iv.detail') }}</span><InputText v-model="f.detail" :placeholder="t('iv.detailPh')" /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>{{ t('iv.qty') }}</span>
          <InputNumber v-model="f.qty" :min="0" :max-fraction-digits="3" input-class="w-full text-lg" @input="(e: any) => (f.qty = e.value)" />
        </label>
        <label class="field"><span>{{ t('iv.unit') }}</span><InputText v-model="f.unit" :placeholder="t('iv.unitPh')" /></label>
      </div>
      <label class="field"><span>{{ t('iv.unitPrice') }} ({{ currency }})</span><AmountField v-model="f.price" :currency="currency" /></label>
      <p class="text-right text-sm">{{ t('iv.amount') }}: <b class="tabular-nums">{{ formatMoney(amount, currency) }}</b></p>
      <label v-if="!line && !f.item_id" class="flex items-center gap-2 text-sm"><Checkbox v-model="f.keep" binary /> {{ t('iv.saveAsItem') }}</label>
    </div>
    <template #footer>
      <Button v-if="line" :label="t('common.delete')" text severity="danger" @click="remove" />
      <span class="flex-1" />
      <Button :label="t('common.cancel')" text @click="open = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!valid" @click="save" />
    </template>
  </Dialog>
</template>
