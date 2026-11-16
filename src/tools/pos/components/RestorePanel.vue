<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { readManifest, restoreArchive } from '../backup/archive'
import { driveConfigured, driveSignedIn, signIn, listShopFolders, listBackups, downloadBackup, type DriveFile } from '../backup/drive'
import { formatBytes } from '@/core/util/storage'

/** Restore from a backup file or from Google Drive. Replaces this device's data. */
const emit = defineEmits<{ restored: [] }>()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const busy = ref(false)
const fileEl = ref<HTMLInputElement | null>(null)
const shops = ref<DriveFile[] | null>(null)
const files = ref<DriveFile[] | null>(null)
const openShop = ref<DriveFile | null>(null)
const err = ref('')

function ask(message: string, run: () => Promise<void>) {
  confirm.require({
    header: t('pos.bk.restoreTitle'),
    message,
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('pos.bk.restoreNow'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: run,
  })
}

async function doRestore(bytes: Uint8Array) {
  busy.value = true
  err.value = ''
  try {
    await restoreArchive(bytes)
    toast.add({ severity: 'success', summary: t('pos.bk.restored'), life: 3000 })
    emit('restored')
  } catch (e: any) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  const bytes = new Uint8Array(await f.arrayBuffer())
  const m = readManifest(bytes)
  const what = m ? `${m.shop ?? ''} · ${new Date(m.created_at).toLocaleString()}` : f.name
  ask(t('pos.bk.restoreConfirm', { what }), () => doRestore(bytes))
}

async function connectDrive() {
  busy.value = true
  err.value = ''
  try {
    if (!driveSignedIn.value) await signIn()
    shops.value = await listShopFolders()
    if (shops.value.length === 1) await pickShop(shops.value[0])
  } catch (e: any) {
    err.value = e.message === 'NEED_SIGN_IN' ? t('pos.bk.needSignIn') : e.message
  } finally {
    busy.value = false
  }
}

async function pickShop(s: DriveFile) {
  openShop.value = s
  files.value = await listBackups(s.id)
}

function pickFile(f: DriveFile) {
  ask(t('pos.bk.restoreConfirm', { what: `${openShop.value?.name} · ${new Date(f.createdTime).toLocaleString()}` }), async () => {
    busy.value = true
    try {
      const bytes = await downloadBackup(f.id)
      await doRestore(bytes)
    } catch (e: any) {
      err.value = e.message
      busy.value = false
    }
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Message severity="warn" :closable="false">{{ t('pos.bk.restoreWarn') }}</Message>
    <div class="flex flex-wrap gap-2">
      <Button :label="t('pos.bk.restoreFile')" icon="pi pi-upload" outlined :loading="busy" @click="fileEl?.click()" />
      <Button v-if="driveConfigured" :label="t('pos.bk.restoreDrive')" icon="pi pi-google" outlined :loading="busy" @click="connectDrive" />
    </div>
    <input ref="fileEl" type="file" accept=".zip,.sqlite,.sqlite3,.db,application/zip" hidden @change="onFile" />
    <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>

    <div v-if="shops && !openShop">
      <p v-if="!shops.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.bk.noDriveBackups') }}</p>
      <ul class="flex flex-col gap-1">
        <li v-for="s in shops" :key="s.id">
          <Button :label="s.name" icon="pi pi-folder" text @click="pickShop(s)" />
        </li>
      </ul>
    </div>
    <div v-if="openShop && files">
      <div class="mb-2 flex items-center gap-2">
        <Button v-if="shops && shops.length > 1" icon="pi pi-arrow-left" text rounded size="small" :aria-label="t('pos.c.back')" @click="openShop = null" />
        <span class="font-semibold"><i class="pi pi-folder" /> {{ openShop.name }}</span>
      </div>
      <p v-if="!files.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.bk.noDriveBackups') }}</p>
      <ul class="max-h-72 divide-y divide-[var(--k-border)] overflow-y-auto rounded-lg border border-[var(--k-border)]">
        <li v-for="f in files" :key="f.id">
          <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--k-border)]/40" @click="pickFile(f)">
            <i class="pi pi-history" />
            <span class="flex-1">{{ new Date(f.createdTime).toLocaleString() }}</span>
            <span class="text-xs text-[var(--k-muted)]">{{ formatBytes(Number(f.size || 0)) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
