<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import BackupPanel from '@/components/BackupPanel.vue'
import SupportCard from '@/components/SupportCard.vue'
import PrivacyPanel from '@/components/PrivacyPanel.vue'
import { appLock as lock, backup, db, wipeHealth } from '../db'
import { readingsCsv } from '../db/data'
import { useHealth } from '../store'

/** Book name, backup & restore, support. */
const { t } = useI18n()
const toast = useToast()
const hl = useHealth()
const name = ref(hl.name)

async function saveName() {
  if (name.value.trim()) await hl.setName(name.value.trim())
  toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
async function csvOut() {
  const url = URL.createObjectURL(new Blob([await readingsCsv(db)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kitroid-health-readings.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
function restored() {
  history.replaceState(null, '', '/health/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('hl.nav.more') }}</h1>
    <section class="card flex flex-wrap items-end gap-3">
      <label class="field min-w-0 flex-1"><span>{{ t('hl.bookName') }}</span><InputText v-model="name" /></label>
      <Button :label="t('common.save')" icon="pi pi-check" @click="saveName" />
    </section>
    <PrivacyPanel :lock="lock" :wipe="wipeHealth" :what="t('hl.title')" />
    <section class="card flex flex-col gap-3">
      <h2 class="font-semibold">{{ t('hl.csvTitle') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('hl.csvBody') }}</p>
      <p class="text-xs text-amber-700 dark:text-amber-400"><i class="pi pi-exclamation-triangle mr-1" />{{ t('privacy.csvWarn') }}</p>
      <Button :label="t('hl.csvExport')" icon="pi pi-file-excel" outlined class="self-start" @click="csvOut" />
    </section>
    <h2 class="mt-2 text-lg font-semibold">{{ t('hl.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Health" @restored="restored" />
    <SupportCard class="mt-2" />
  </div>
</template>
