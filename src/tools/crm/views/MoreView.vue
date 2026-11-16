<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import BackupPanel from '@/components/BackupPanel.vue'
import { backup, db } from '../db'
import { exportCsv, importCsv } from '../db/data'
import { useCrm } from '../store'

/** Book name, CSV import/export, backup & restore. */
const { t } = useI18n()
const toast = useToast()
const crm = useCrm()
const name = ref(crm.name)
const fileEl = ref<HTMLInputElement | null>(null)

async function saveName() {
  if (name.value.trim()) await crm.setName(name.value.trim())
  toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
async function csvOut() {
  const url = URL.createObjectURL(new Blob([await exportCsv(db)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kitroid-customers.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
async function csvIn(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  try {
    const r = await importCsv(db, await f.text())
    await crm.load()
    toast.add({ severity: 'success', summary: t('crm.imported', r), life: 4000 })
  } catch (err: any) {
    toast.add({ severity: 'error', summary: err.message === 'NO_NAME_COLUMN' ? t('crm.csvNeedsName') : err.message, life: 5000 })
  }
}
function restored() {
  history.replaceState(null, '', '/crm/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('crm.nav.more') }}</h1>
    <section class="card flex flex-wrap items-end gap-3">
      <label class="field min-w-0 flex-1"><span>{{ t('crm.bookName') }}</span><InputText v-model="name" /></label>
      <Button :label="t('common.save')" icon="pi pi-check" @click="saveName" />
    </section>
    <section class="card flex flex-col gap-3">
      <h2 class="font-semibold">{{ t('crm.csvTitle') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('crm.csvBody') }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="t('crm.csvExport')" icon="pi pi-file-excel" outlined @click="csvOut" />
        <Button :label="t('crm.csvImport')" icon="pi pi-upload" outlined @click="fileEl?.click()" />
      </div>
      <input ref="fileEl" type="file" accept=".csv,text/csv" hidden @change="csvIn" />
    </section>
    <h2 class="mt-2 text-lg font-semibold">{{ t('crm.nav.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Customers" @restored="restored" />
  </div>
</template>
