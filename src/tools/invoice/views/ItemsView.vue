<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { deleteItem, saveItem, type Item } from '../db/data'
import { useInvoice } from '../store'
import { formatMoney, type Currency } from '@/core/util/money'

/** Saved products and services with a price, picked when adding a line. */
const { t } = useI18n()
const confirm = useConfirm()
const iv = useInvoice()
const open = ref(false)
const f = reactive({ id: '' as string | undefined, name: '', unit: '', price: 0, currency: 'USD' as Currency })
const curOpts = [
  { label: '$ USD', value: 'USD' },
  { label: '៛ KHR', value: 'KHR' },
]
function edit(i?: Item) {
  Object.assign(f, { id: i?.id, name: i?.name ?? '', unit: i?.unit ?? '', price: i?.price ?? 0, currency: i?.currency ?? iv.currency })
  open.value = true
}
async function save() {
  if (!f.name.trim()) return
  await saveItem(db, { ...f })
  open.value = false
  await iv.load()
}
function remove() {
  confirm.require({
    message: t('iv.deleteItemConfirm', { name: f.name }),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteItem(db, f.id!)
      open.value = false
      await iv.load()
    },
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('iv.nav.items') }}</h1>
      <Button :label="t('iv.newItem')" icon="pi pi-plus" @click="edit()" />
    </div>
    <p class="text-sm text-[var(--k-muted)]">{{ t('iv.itemsHint') }}</p>
    <p v-if="!iv.items.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('iv.noItems') }}</p>
    <ul v-else class="flex flex-col divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="i in iv.items" :key="i.id">
        <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" @click="edit(i)">
          <span class="flex-1 font-semibold">{{ i.name }}</span>
          <span class="tabular-nums">{{ formatMoney(i.price, i.currency) }}<span v-if="i.unit" class="text-sm text-[var(--k-muted)]"> / {{ i.unit }}</span></span>
        </button>
      </li>
    </ul>
    <Dialog v-model:visible="open" modal :header="f.id ? t('iv.editItem') : t('iv.newItem')" class="w-[min(28rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('iv.itemName') }}</span><InputText v-model="f.name" autofocus /></label>
        <SelectButton v-model="f.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        <div class="grid grid-cols-2 gap-3">
          <label class="field"><span>{{ t('iv.unitPrice') }}</span><AmountField v-model="f.price" :currency="f.currency" /></label>
          <label class="field"><span>{{ t('iv.unit') }}</span><InputText v-model="f.unit" :placeholder="t('iv.unitPh')" /></label>
        </div>
      </div>
      <template #footer>
        <Button v-if="f.id" :label="t('common.delete')" text severity="danger" @click="remove" />
        <span class="flex-1" />
        <Button :label="t('common.cancel')" text @click="open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
