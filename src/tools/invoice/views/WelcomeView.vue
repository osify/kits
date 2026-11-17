<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import BackupPanel from '@/components/BackupPanel.vue'
import { backup, db } from '../db'
import { setupBook } from '../db/data'
import { useInvoice } from '../store'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const iv = useInvoice()
const name = ref('')
const currency = ref<'KHR' | 'USD'>('USD')
const rate = ref(4100)
const accept = ref(false)
const restoring = ref(false)
const curOpts = [
  { label: '$ USD', value: 'USD' },
  { label: '៛ KHR', value: 'KHR' },
]
async function start() {
  if (!name.value.trim() || !accept.value) return
  await setupBook(db, name.value.trim(), currency.value, rate.value || 4100)
  await requestPersist()
  await iv.load()
  location.hash = '#/more'
}
function restored() {
  history.replaceState(null, '', '/invoice/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('iv.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('iv.tagline') }}</p>
    </div>
    <section v-if="!restoring" class="card flex flex-col gap-4">
      <label class="field"><span>{{ t('iv.bizName') }}</span><InputText v-model="name" :placeholder="t('iv.welcome.namePh')" autofocus /></label>
      <div class="field">
        <span>{{ t('iv.defaultCurrency') }}</span>
        <SelectButton v-model="currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        <small class="text-[var(--k-muted)]">{{ t('iv.currencyHint') }}</small>
      </div>
      <label class="field">
        <span>{{ t('iv.rate') }}</span>
        <InputNumber v-model="rate" :min="1" suffix=" ៛ / $1" @input="(e: any) => (rate = e.value)" />
      </label>
      <Message severity="warn" :closable="false">{{ t('iv.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="accept" binary /> {{ t('iv.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('iv.welcome.start')" icon="pi pi-check" :disabled="!name.trim() || !accept" @click="start" />
        <span class="flex-1" />
        <Button :label="t('iv.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>
    <template v-else>
      <BackupPanel :backup="backup" drive-folder="Kitroid / Invoices" @restored="restored" />
      <Button :label="t('common.back')" text icon="pi pi-arrow-left" class="self-start" @click="restoring = false" />
    </template>
  </div>
</template>
