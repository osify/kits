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
import { usePayroll } from '../store'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const pr = usePayroll()
const name = ref('')
const currency = ref<'KHR' | 'USD'>('KHR')
const rate = ref(4100)
const accept = ref(false)
const restoring = ref(false)
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
async function start() {
  if (!name.value.trim() || !accept.value) return
  await setupBook(db, name.value.trim(), currency.value, rate.value || 4100)
  await requestPersist()
  await pr.load()
  location.hash = '#/staff'
}
function restored() {
  history.replaceState(null, '', '/payroll/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('pr.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('pr.tagline') }}</p>
    </div>
    <section v-if="!restoring" class="card flex flex-col gap-4">
      <label class="field"><span>{{ t('pr.bizName') }}</span><InputText v-model="name" :placeholder="t('pr.welcome.namePh')" autofocus /></label>
      <div class="field">
        <span>{{ t('pr.defaultCurrency') }}</span>
        <SelectButton v-model="currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        <small class="text-[var(--k-muted)]">{{ t('pr.currencyHint') }}</small>
      </div>
      <label class="field">
        <span>{{ t('pr.rate') }}</span>
        <InputNumber v-model="rate" :min="1" suffix=" ៛ / $1" @input="(e: any) => (rate = e.value)" />
      </label>
      <Message severity="warn" :closable="false">{{ t('pr.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="accept" binary /> {{ t('pr.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('pr.welcome.start')" icon="pi pi-check" :disabled="!name.trim() || !accept" @click="start" />
        <span class="flex-1" />
        <Button :label="t('pr.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>
    <template v-else>
      <BackupPanel :backup="backup" drive-folder="Kitroid / Payroll" @restored="restored" />
      <Button :label="t('common.back')" text icon="pi pi-arrow-left" class="self-start" @click="restoring = false" />
    </template>
  </div>
</template>
