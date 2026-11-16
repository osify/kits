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
import { useTongtin } from '../store'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const router = useRouter()
const tt = useTongtin()
const name = ref('')
const accept = ref(false)
const restoring = ref(false)

async function start() {
  if (!name.value.trim() || !accept.value) return
  await setupBook(db, name.value.trim())
  await requestPersist()
  await tt.load()
  router.replace('/new')
}
function restored() {
  history.replaceState(null, '', '/tongtin/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('tt.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('tt.tagline') }}</p>
    </div>
    <section v-if="!restoring" class="card flex flex-col gap-4">
      <label class="field"><span>{{ t('tt.bookName') }}</span><InputText v-model="name" :placeholder="t('tt.welcome.namePh')" autofocus /></label>
      <Message severity="warn" :closable="false">{{ t('tt.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="accept" binary /> {{ t('tt.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('tt.welcome.start')" icon="pi pi-check" :disabled="!name.trim() || !accept" @click="start" />
        <span class="flex-1" />
        <Button :label="t('tt.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>
    <template v-else>
      <BackupPanel :backup="backup" drive-folder="Kitroid / Tong Tin" @restored="restored" />
      <Button :label="t('common.back')" text icon="pi pi-arrow-left" class="self-start" @click="restoring = false" />
    </template>
  </div>
</template>
