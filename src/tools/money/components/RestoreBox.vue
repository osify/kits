<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { driveBookFiles, driveBooks, readManifest, restore, restoreFromDrive } from '../backup'
import { driveConfigured, driveSignedIn, signIn, type DriveFile } from '@/core/backup/drive'

/** Restore a book from a backup file or from Google Drive (replaces this device's data). */
const emit = defineEmits<{ restored: [] }>()
const { t } = useI18n()
const confirm = useConfirm()
const busy = ref(false)
const err = ref('')
const fileEl = ref<HTMLInputElement | null>(null)
const books = ref<DriveFile[] | null>(null)
const files = ref<DriveFile[] | null>(null)

function ask(what: string, run: () => Promise<void>) {
  confirm.require({
    header: t('money.bk.restore'),
    message: t('money.bk.restoreConfirm', { what }),
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('money.bk.restoreNow'), severity: 'danger' },
    rejectProps: { label: t('money.cancel'), text: true },
    accept: async () => {
      busy.value = true
      err.value = ''
      try {
        await run()
        emit('restored')
      } catch (e: any) {
        err.value = e.message === 'NOT_BACKUP' ? t('money.bk.notBackup') : e.message
      } finally {
        busy.value = false
      }
    },
  })
}
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  const bytes = new Uint8Array(await f.arrayBuffer())
  const m = readManifest(bytes)
  ask(m ? `${m.book ?? ''} · ${new Date(m.created_at).toLocaleString()}` : f.name, () => restore(bytes))
}
async function fromDrive() {
  busy.value = true
  err.value = ''
  try {
    if (!driveSignedIn.value) await signIn()
    books.value = await driveBooks()
    if (books.value.length === 1) files.value = await driveBookFiles(books.value[0].id)
  } catch (e: any) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-semibold">{{ t('money.bk.restore') }}</h2>
    <Message severity="warn" :closable="false">{{ t('money.bk.restoreWarn') }}</Message>
    <div class="flex flex-wrap gap-2">
      <Button :label="t('money.bk.fromFile')" icon="pi pi-upload" outlined :loading="busy" @click="fileEl?.click()" />
      <Button v-if="driveConfigured" :label="t('money.bk.fromDrive')" icon="pi pi-google" outlined :loading="busy" @click="fromDrive" />
    </div>
    <input ref="fileEl" type="file" accept=".zip,application/zip" hidden @change="onFile" />
    <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>
    <ul v-if="books && !files" class="flex flex-col gap-1">
      <li v-if="!books.length" class="text-sm text-[var(--k-muted)]">{{ t('money.bk.noneInDrive') }}</li>
      <li v-for="b in books" :key="b.id"><Button :label="b.name" icon="pi pi-folder" text @click="driveBookFiles(b.id).then((r) => (files = r))" /></li>
    </ul>
    <ul v-if="files" class="max-h-72 divide-y divide-[var(--k-border)] overflow-y-auto rounded-lg border border-[var(--k-border)]">
      <li v-if="!files.length" class="p-3 text-sm text-[var(--k-muted)]">{{ t('money.bk.noneInDrive') }}</li>
      <li v-for="f in files" :key="f.id">
        <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--k-border)]/40" @click="ask(new Date(f.createdTime).toLocaleString(), () => restoreFromDrive(f.id))">
          <i class="pi pi-history" /><span class="flex-1">{{ new Date(f.createdTime).toLocaleString() }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
