<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import AutoComplete from 'primevue/autocomplete'
import { db } from '../db'
import { saveCustomer, tagList, type Customer } from '../db/data'
import { useCrm } from '../store'

const props = defineProps<{ customer: Customer | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useI18n()
const crm = useCrm()
const f = reactive({ name: '', phone: '', telegram: '', address: '', tags: [] as string[], birthday: '', note: '' })
const saving = ref(false)
const suggestions = ref<string[]>([])

watch(visible, (v) => {
  if (!v) return
  const c = props.customer
  Object.assign(f, {
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    telegram: c?.telegram ?? '',
    address: c?.address ?? '',
    tags: tagList(c?.tags),
    birthday: c?.birthday ?? '',
    note: c?.note ?? '',
  })
})
const valid = computed(() => !!f.name.trim())
function search(e: { query: string }) {
  const q = e.query.trim().toLowerCase()
  suggestions.value = [...new Set([...crm.tags, q ? e.query.trim() : ''])].filter((x) => x && x.toLowerCase().includes(q) && !f.tags.includes(x))
}

async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    const id = await saveCustomer(db, { id: props.customer?.id, ...f, tags: f.tags.join(','), birthday: f.birthday.trim() || null, photo: props.customer?.photo ?? null })
    emit('saved', id)
    visible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="customer ? t('crm.editCustomer') : t('crm.newCustomer')" class="w-[min(32rem,calc(100vw-1rem))]">
    <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
      <label class="field sm:col-span-2"><span>{{ t('crm.name') }}</span><InputText v-model="f.name" autofocus /></label>
      <label class="field"><span>{{ t('crm.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
      <label class="field"><span>Telegram</span><InputText v-model="f.telegram" placeholder="@username" /></label>
      <label class="field sm:col-span-2"><span>{{ t('crm.address') }}</span><InputText v-model="f.address" /></label>
      <label class="field sm:col-span-2">
        <span>{{ t('crm.tags') }}</span>
        <AutoComplete v-model="f.tags" multiple :typeahead="false" :suggestions="suggestions" :placeholder="t('crm.tagsPh')" class="w-full" @complete="search" />
      </label>
      <label class="field"><span>{{ t('crm.birthday') }}</span><InputText v-model="f.birthday" placeholder="MM-DD" maxlength="10" /></label>
      <label class="field sm:col-span-2"><span>{{ t('crm.note') }}</span><Textarea v-model="f.note" rows="2" auto-resize /></label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :disabled="!valid" :loading="saving" @click="save" />
    </template>
  </Dialog>
</template>
