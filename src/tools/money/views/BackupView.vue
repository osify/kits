<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import RestoreBox from '../components/RestoreBox.vue'
import { backupToDrive, downloadFile, driveFiles, isDirty, moneyBackup } from '../backup'
import { driveConfigured, driveSignedIn, signIn, signOut, type DriveFile } from '@/core/backup/drive'

const { t } = useI18n()
const toast = useToast()
const files = ref<DriveFile[] | null>(null)
const restoreOpen = ref(false)

async function refresh() {
  if (driveSignedIn.value) files.value = await driveFiles().catch(() => null)
}
onMounted(refresh)

async function toDrive() {
  try {
    if (!driveSignedIn.value) await signIn()
    await backupToDrive()
    toast.add({ severity: 'success', summary: t('money.bk.ok'), life: 2500 })
    await refresh()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e.message === 'NEED_SIGN_IN' ? t('money.bk.signInAgain') : e.message, life: 5000 })
  }
}
async function download() {
  const name = await downloadFile()
  toast.add({ severity: 'success', summary: t('money.bk.downloaded'), detail: name, life: 3000 })
}
function restored() {
  history.replaceState(null, '', '/money/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold">{{ t('money.nav.backup') }}</h1>
      <p class="text-sm text-[var(--k-muted)]">{{ t('money.bk.intro') }}</p>
    </div>
    <div class="flex items-center gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <i class="pi text-2xl" :class="isDirty() ? 'pi-exclamation-circle text-amber-600' : 'pi-check-circle text-primary-600'" />
      <div>
        <div class="font-semibold">{{ t('money.bk.last', { when: moneyBackup.lastBackupAt ? new Date(moneyBackup.lastBackupAt).toLocaleString() : t('money.bk.never') }) }}</div>
        <div class="text-sm text-[var(--k-muted)]">{{ isDirty() ? t('money.bk.dirty') : t('money.bk.clean') }}</div>
      </div>
    </div>

    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-google text-xl" />
        <h2 class="flex-1 font-semibold">Google Drive</h2>
        <Tag v-if="driveSignedIn" severity="success" :value="t('money.bk.connected')" />
      </div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('money.bk.driveBody') }}</p>
      <Message v-if="!driveConfigured" severity="secondary" :closable="false">{{ t('money.bk.notConfigured') }}</Message>
      <div v-else class="flex flex-wrap gap-2">
        <Button :label="t('money.bk.backupNow')" icon="pi pi-cloud-upload" :loading="moneyBackup.running" @click="toDrive" />
        <Button v-if="driveSignedIn" :label="t('money.bk.disconnect')" text severity="secondary" @click="signOut" />
      </div>
      <p v-if="files" class="mt-2 text-xs text-[var(--k-muted)]">{{ t('money.bk.inDrive', { n: files.length }) }}</p>
    </section>

    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2"><i class="pi pi-download text-xl" /><h2 class="font-semibold">{{ t('money.bk.downloadTitle') }}</h2></div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('money.bk.downloadBody') }}</p>
      <Button :label="t('money.bk.download')" icon="pi pi-download" outlined @click="download" />
    </section>

    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <RestoreBox v-if="restoreOpen" @restored="restored" />
      <Button v-else :label="t('money.bk.restoreOpen')" icon="pi pi-history" text @click="restoreOpen = true" />
    </section>
  </div>
</template>
