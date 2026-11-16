<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import BackupPanel from '@/components/BackupPanel.vue'
import { backup, db } from '../db'
import { saveService, setupClinic } from '../db/data'
import { useClinic } from '../store'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const cl = useClinic()
const name = ref('')
const currency = ref<'KHR' | 'USD'>('KHR')
const accept = ref(false)
const restoring = ref(false)
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]

async function start() {
  if (!name.value.trim() || !accept.value) return
  await setupClinic(db, name.value.trim(), currency.value)
  const id = await saveService(db, { name: t('cl.defaultConsult'), kind: 'SERVICE', price: currency.value === 'KHR' ? 20_000 : 500 })
  await cl.set('consult_service', id)
  await requestPersist()
  await cl.load()
  location.hash = '#/more'
}
function restored() {
  history.replaceState(null, '', '/clinic/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('cl.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('cl.tagline') }}</p>
    </div>
    <section v-if="!restoring" class="card flex flex-col gap-4">
      <label class="field"><span>{{ t('cl.clinicName') }}</span><InputText v-model="name" :placeholder="t('cl.welcome.namePh')" autofocus /></label>
      <div class="field">
        <span>{{ t('cl.currency') }}</span>
        <SelectButton v-model="currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" />
        <small class="text-[var(--k-muted)]">{{ t('cl.currencyHint') }}</small>
      </div>
      <Message severity="warn" :closable="false">{{ t('cl.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="accept" binary /> {{ t('cl.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('cl.welcome.start')" icon="pi pi-check" :disabled="!name.trim() || !accept" @click="start" />
        <span class="flex-1" />
        <Button :label="t('cl.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>
    <template v-else>
      <BackupPanel :backup="backup" drive-folder="Kitroid / Clinic" @restored="restored" />
      <Button :label="t('common.back')" text icon="pi pi-arrow-left" class="self-start" @click="restoring = false" />
    </template>
  </div>
</template>
