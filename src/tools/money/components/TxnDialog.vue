<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import AmountField from './AmountField.vue'
import ImagePicker from './PhotoPicker.vue'
import { db, dbState } from '../db'
import { deleteTxn, saveTxn, type TxnKind, type TxnRow } from '../db/data'
import { useBook, catName } from '../store'
import { today } from '@/core/util/date'
import { prefs } from '@/core/util/prefs'

/** Add or edit money in / money out / transfer. */
const props = defineProps<{ txn: TxnRow | null; kind?: TxnKind }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const book = useBook()

const f = reactive({
  kind: 'OUT' as TxnKind,
  date: new Date(),
  account_id: '',
  to_account_id: '' as string | null,
  category_id: null as string | null,
  amount: 0,
  to_amount: 0,
  note: '',
  photo: null as string | null,
})
const saving = ref(false)

watch(visible, (v) => {
  if (!v) return
  const x = props.txn
  const lastAcc = prefs.get('money.lastAccount')
  const fallback = book.activeAccounts.find((a) => a.id === lastAcc)?.id ?? book.activeAccounts[0]?.id ?? ''
  Object.assign(f, {
    kind: x?.kind ?? props.kind ?? 'OUT',
    date: x ? new Date(x.date + 'T00:00:00') : new Date(),
    account_id: x?.account_id ?? fallback,
    to_account_id: x?.to_account_id ?? book.activeAccounts.find((a) => a.id !== fallback)?.id ?? null,
    category_id: x?.category_id ?? null,
    amount: x?.amount ?? 0,
    to_amount: x?.to_amount ?? 0,
    note: x?.note ?? '',
    photo: x?.photo ?? null,
  })
})

const kinds = computed(() => [
  { label: t('money.kind.OUT'), value: 'OUT', icon: 'pi pi-arrow-up-right' },
  { label: t('money.kind.IN'), value: 'IN', icon: 'pi pi-arrow-down-left' },
  { label: t('money.kind.MOVE'), value: 'MOVE', icon: 'pi pi-arrow-right-arrow-left' },
])
const accountOptions = computed(() => book.activeAccounts.map((a) => ({ label: `${a.name} (${a.currency === 'KHR' ? '៛' : '$'})`, value: a.id })))
const cats = computed(() => book.categories.filter((c) => c.active && c.kind === (f.kind === 'IN' ? 'IN' : 'OUT')))
const fromCur = computed(() => book.accountById.get(f.account_id)?.currency ?? book.base)
const toCur = computed(() => (f.to_account_id ? book.accountById.get(f.to_account_id)?.currency : null) ?? fromCur.value)
const crossCurrency = computed(() => f.kind === 'MOVE' && fromCur.value !== toCur.value)

// Transfer between ៛ and $ accounts: suggest the other side from the rate.
watch([() => f.amount, crossCurrency, () => f.to_account_id], () => {
  if (!crossCurrency.value) return
  const r = book.rate
  f.to_amount = fromCur.value === 'KHR' ? Math.round((f.amount / r) * 100) : Math.round((f.amount / 100) * r / 100) * 100
})

const valid = computed(() => f.amount > 0 && !!f.account_id && (f.kind !== 'MOVE' || (!!f.to_account_id && f.to_account_id !== f.account_id)))

/** The dialog focuses the [autofocus] amount on open; after "Save & add another" we do it. */
function focusAmount() {
  setTimeout(() => (document.getElementById('txn-amount') as HTMLInputElement | null)?.select(), 0)
}

async function save(addAnother = false) {
  if (!valid.value) return
  saving.value = true
  try {
    await saveTxn(
      db,
      {
        id: props.txn?.id,
        kind: f.kind,
        date: today(f.date),
        account_id: f.account_id,
        to_account_id: f.to_account_id,
        category_id: f.category_id,
        amount: f.amount,
        to_amount: crossCurrency.value ? f.to_amount : f.amount,
        khr_per_usd: props.txn?.khr_per_usd ?? book.rate,
        note: f.note.trim(),
        photo: f.photo,
      },
      dbState.deviceId,
    )
    prefs.set('money.lastAccount', f.account_id)
    emit('saved')
    toast.add({ severity: 'success', summary: t('money.saved'), life: 1500 })
    if (addAnother && !props.txn) {
      Object.assign(f, { amount: 0, to_amount: 0, note: '', photo: null })
      focusAmount()
    } else visible.value = false
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e.message, life: 4000 })
  } finally {
    saving.value = false
  }
}

function remove() {
  if (!props.txn) return
  confirm.require({
    header: t('money.delete'),
    message: t('money.deleteConfirm'),
    icon: 'pi pi-trash',
    acceptProps: { label: t('money.delete'), severity: 'danger' },
    rejectProps: { label: t('money.cancel'), text: true },
    accept: async () => {
      await deleteTxn(db, props.txn!.id)
      emit('saved')
      visible.value = false
    },
  })
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="txn ? t('money.edit') : t('money.add')" class="w-[min(32rem,calc(100vw-1rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save()">
      <SelectButton v-model="f.kind" :options="kinds" option-label="label" option-value="value" :allow-empty="false" class="w-full [&>*]:flex-1">
        <template #option="{ option }"><i :class="option.icon" /><span>{{ option.label }}</span></template>
      </SelectButton>

      <label class="field">
        <span>{{ f.kind === 'MOVE' ? t('money.fromAccount') : t('money.account') }}</span>
        <Select v-model="f.account_id" :options="accountOptions" option-label="label" option-value="value" />
      </label>
      <label class="field">
        <span>{{ t('money.amount') }}</span>
        <AmountField v-model="f.amount" :currency="fromCur" input-id="txn-amount" autofocus />
      </label>

      <template v-if="f.kind === 'MOVE'">
        <label class="field">
          <span>{{ t('money.toAccount') }}</span>
          <Select v-model="f.to_account_id" :options="accountOptions.filter((o) => o.value !== f.account_id)" option-label="label" option-value="value" />
        </label>
        <label v-if="crossCurrency" class="field">
          <span>{{ t('money.received') }}</span>
          <AmountField v-model="f.to_amount" :currency="toCur" />
          <small class="text-[var(--k-muted)]">{{ t('money.rateHint', { rate: book.rate.toLocaleString('en-US') }) }}</small>
        </label>
      </template>

      <div v-else class="field">
        <span>{{ t('money.category') }}</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in cats"
            :key="c.id"
            type="button"
            class="rounded-full border px-3 py-1 text-sm"
            :class="f.category_id === c.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-[var(--k-border)] bg-[var(--k-surface)]'"
            :aria-pressed="f.category_id === c.id"
            @click="f.category_id = f.category_id === c.id ? null : c.id"
          >
            <span v-if="c.icon" aria-hidden="true">{{ c.icon }}</span> {{ catName(c, locale) }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="field"><span>{{ t('money.date') }}</span><DatePicker v-model="f.date" date-format="yy-mm-dd" :max-date="new Date()" show-icon /></label>
        <label class="field"><span>{{ t('money.note') }}</span><InputText v-model="f.note" /></label>
      </div>
      <div class="field">
        <span>{{ t('money.photo') }}</span>
        <ImagePicker v-model="f.photo" />
      </div>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button v-if="txn" :label="t('money.delete')" text severity="danger" icon="pi pi-trash" class="mr-auto" @click="remove" />
      <Button v-if="!txn" :label="t('money.saveAdd')" outlined :disabled="!valid" :loading="saving" @click="save(true)" />
      <Button :label="t('money.save')" icon="pi pi-check" :disabled="!valid" :loading="saving" @click="save()" />
    </template>
  </Dialog>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
</style>
