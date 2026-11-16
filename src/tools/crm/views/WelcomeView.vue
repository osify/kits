<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import BackupPanel from '@/components/BackupPanel.vue'
import { backup, db } from '../db'
import { setupBook } from '../db/data'
import { useCrm } from '../store'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const router = useRouter()
const crm = useCrm()
const name = ref('')
const accept = ref(false)
const restoring = ref(false)

async function start() {
  if (!name.value.trim() || !accept.value) return
  await setupBook(db, name.value.trim())
  await requestPersist()
  await crm.load()
  router.replace('/list')
}
function restored() {
  history.replaceState(null, '', '/crm/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('crm.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('crm.tagline') }}</p>
    </div>
    <section v-if="!restoring" class="card flex flex-col gap-4">
      <label class="field"><span>{{ t('crm.bookName') }}</span><InputText v-model="name" :placeholder="t('crm.welcome.namePh')" autofocus /></label>
      <Message severity="warn" :closable="false">{{ t('crm.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="accept" binary /> {{ t('crm.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('crm.welcome.start')" icon="pi pi-check" :disabled="!name.trim() || !accept" @click="start" />
        <span class="flex-1" />
        <Button :label="t('crm.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>
    <template v-else>
      <BackupPanel :backup="backup" drive-folder="Kitroid / Customers" @restored="restored" />
      <Button :label="t('common.back')" text icon="pi pi-arrow-left" class="self-start" @click="restoring = false" />
    </template>
  </div>
</template>
