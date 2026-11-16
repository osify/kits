<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { saveCustomer, type Customer } from '../db/customers'

/** Add / edit a customer. Emits the saved id. */
const props = defineProps<{ customer: Customer | null; initialName?: string }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useI18n()
const f = reactive({ name: '', phone: '', note: '' })
const saving = ref(false)

watch(visible, (v) => {
  if (!v) return
  Object.assign(f, { name: props.customer?.name ?? props.initialName ?? '', phone: props.customer?.phone ?? '', note: props.customer?.note ?? '' })
})

async function save() {
  if (!f.name.trim()) return
  saving.value = true
  try {
    const id = await saveCustomer({ id: props.customer?.id, name: f.name.trim(), phone: f.phone.trim(), note: f.note.trim() })
    emit('saved', id)
    visible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="customer ? t('pos.cust.edit') : t('pos.cust.new')" class="w-[min(26rem,calc(100vw-1.5rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.cust.name') }}</span><InputText v-model="f.name" autofocus /></label>
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.setup.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.note') }}</span><InputText v-model="f.note" /></label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.c.save')" icon="pi pi-check" :loading="saving" :disabled="!f.name.trim()" @click="save" />
    </template>
  </Dialog>
</template>
