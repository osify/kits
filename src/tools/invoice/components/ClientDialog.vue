<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { db } from '../db'
import { deleteClient, saveClient, type Client } from '../db/data'

/** Add or edit a client. Emits the saved id (or '' after delete). */
const props = defineProps<{ client?: Client | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useI18n()
const confirm = useConfirm()
const f = reactive({ id: '' as string | undefined, name: '', company: '', vat_tin: '', address: '', phone: '', email: '', note: '' })
watch(open, (v) => {
  if (!v) return
  const c = props.client
  Object.assign(f, { id: c?.id, name: c?.name ?? '', company: c?.company ?? '', vat_tin: c?.vat_tin ?? '', address: c?.address ?? '', phone: c?.phone ?? '', email: c?.email ?? '', note: c?.note ?? '' })
})
async function save() {
  if (!f.name.trim()) return
  const id = await saveClient(db, { ...f })
  open.value = false
  emit('saved', id)
}
function remove() {
  confirm.require({
    message: t('iv.deleteClientConfirm', { name: f.name }),
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await deleteClient(db, f.id!)
      open.value = false
      emit('saved', '')
    },
  })
}
</script>

<template>
  <Dialog v-model:visible="open" modal :header="f.id ? t('iv.editClient') : t('iv.newClient')" class="w-[min(32rem,calc(100vw-1rem))]">
    <div class="flex flex-col gap-3">
      <label class="field"><span>{{ t('iv.clientName') }}</span><InputText v-model="f.name" autofocus /></label>
      <label class="field"><span>{{ t('iv.company') }}</span><InputText v-model="f.company" :placeholder="t('iv.companyPh')" /></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('iv.vatTin') }}</span><InputText v-model="f.vat_tin" placeholder="K001-123456789" /></label>
        <label class="field"><span>{{ t('iv.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
      </div>
      <label class="field"><span>{{ t('iv.email') }}</span><InputText v-model="f.email" inputmode="email" /></label>
      <label class="field"><span>{{ t('iv.address') }}</span><Textarea v-model="f.address" rows="2" auto-resize /></label>
      <label class="field"><span>{{ t('iv.note') }}</span><InputText v-model="f.note" /></label>
      <p class="text-xs text-[var(--k-muted)]">{{ t('iv.clientSnapshot') }}</p>
    </div>
    <template #footer>
      <Button v-if="f.id" :label="t('common.delete')" text severity="danger" @click="remove" />
      <span class="flex-1" />
      <Button :label="t('common.cancel')" text @click="open = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" @click="save" />
    </template>
  </Dialog>
</template>
