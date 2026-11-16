<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import BackupPanel from '@/components/BackupPanel.vue'
import SupportCard from '@/components/SupportCard.vue'
import { backup } from '../db'
import { useTongtin } from '../store'

/** Book name, backup & restore, support. */
const { t } = useI18n()
const toast = useToast()
const tt = useTongtin()
const name = ref(tt.name)

async function saveName() {
  if (name.value.trim()) await tt.setName(name.value.trim())
  toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
function restored() {
  history.replaceState(null, '', '/tongtin/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('tt.nav.more') }}</h1>
    <section class="card flex flex-wrap items-end gap-3">
      <label class="field min-w-0 flex-1"><span>{{ t('tt.bookName') }}</span><InputText v-model="name" /></label>
      <Button :label="t('common.save')" icon="pi pi-check" @click="saveName" />
    </section>
    <h2 class="mt-2 text-lg font-semibold">{{ t('tt.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Tong Tin" @restored="restored" />
    <SupportCard class="mt-2" />
  </div>
</template>
