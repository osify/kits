<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import AmountField from '@/components/AmountField.vue'
import { db, dbState } from '../db'
import { addActivity, addFollowup, addLedger, type ActivityKind, type EntryMode } from '../db/data'
import { today } from '@/core/util/date'

/** Log something for a customer: a contact note, a debt, a payment, or a follow-up. */
const props = defineProps<{ customerId: string; mode: EntryMode }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const toast = useToast()

const f = reactive({ kind: 'CALL' as ActivityKind, date: new Date(), note: '', currency: 'KHR' as 'KHR' | 'USD', amount: 0 })
const saving = ref(false)
watch(visible, (v) => {
  if (!v) return
  const due = new Date()
  if (props.mode === 'followup') due.setDate(due.getDate() + 3)
  Object.assign(f, { kind: 'CALL', date: due, note: '', amount: 0 })
})

const kinds = computed(() => (['CALL', 'VISIT', 'MESSAGE', 'SALE', 'NOTE'] as ActivityKind[]).map((k) => ({ label: t(`crm.kind.${k}`), value: k })))
const curOpts = [
  { label: '៛', value: 'KHR' },
  { label: '$', value: 'USD' },
]
const title = computed(() => t(`crm.entry.${props.mode}`))
const money = computed(() => props.mode === 'charge' || props.mode === 'payment')
const valid = computed(() => (money.value ? f.amount > 0 : props.mode === 'followup' ? true : !!f.note.trim() || f.kind !== 'NOTE'))

async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    const d = today(f.date)
    if (props.mode === 'activity') await addActivity(db, props.customerId, f.kind, d, f.note.trim(), dbState.deviceId)
    else if (props.mode === 'followup') await addFollowup(db, props.customerId, d, f.note.trim(), dbState.deviceId)
    else await addLedger(db, props.customerId, props.mode === 'charge' ? 'CHARGE' : 'PAYMENT', f.currency, f.amount, d, f.note.trim(), dbState.deviceId)
    emit('saved')
    visible.value = false
    toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="title" class="w-[min(28rem,calc(100vw-1rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <SelectButton v-if="mode === 'activity'" v-model="f.kind" :options="kinds" option-label="label" option-value="value" :allow-empty="false" class="flex-wrap" />
      <div v-if="money" class="field">
        <span>{{ t('crm.amount') }}</span>
        <div class="flex gap-2">
          <AmountField v-model="f.amount" :currency="f.currency" input-id="crm-amount" autofocus class="flex-1" />
          <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        </div>
      </div>
      <label class="field">
        <span>{{ mode === 'followup' ? t('crm.dueDate') : t('crm.date') }}</span>
        <DatePicker v-model="f.date" date-format="yy-mm-dd" show-icon :min-date="mode === 'followup' ? new Date() : undefined" :max-date="mode === 'followup' ? undefined : new Date()" />
      </label>
      <label class="field"><span>{{ mode === 'followup' ? t('crm.whatToDo') : t('crm.note') }}</span><InputText v-model="f.note" :autofocus="!money" /></label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!valid" :loading="saving" @click="save" />
    </template>
  </Dialog>
</template>
