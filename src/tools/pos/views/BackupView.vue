<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import RestorePanel from '../components/RestorePanel.vue'
import SyncPanel from '../components/SyncPanel.vue'
import { backupState, runBackup, downloadBackupFile, setAuto, isDirty, type BackupResult } from '../backup'
import { driveConfigured, driveSignedIn, signIn, signOut, shopBackups, type DriveFile } from '../backup/drive'
import { folderSupported, folderName, chooseFolder, forgetFolder, folderPermission } from '../backup/folder'
import { useShopStore } from '../stores/shop'
import { db } from '../db'
import { formatBytes } from '@/core/util/storage'

const { t } = useI18n()
const toast = useToast()
const shop = useShopStore()

const driveFiles = ref<DriveFile[] | null>(null)
const folderPerm = ref('none')
const log = ref<{ target: string; status: string; bytes: number | null; file_name: string | null; error: string | null; created_at: number }[]>([])
const restoreOpen = ref(false)

async function refresh() {
  folderPerm.value = await folderPermission()
  log.value = await db.query(`SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 15`)
  if (driveSignedIn.value && shop.shop) driveFiles.value = await shopBackups(shop.shop.id, shop.shop.name).catch(() => null)
}
onMounted(refresh)

const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : t('pos.bk.never'))
const lastText = computed(() => when(backupState.lastBackupAt))

function report(res: BackupResult) {
  for (const [k, v] of Object.entries(res)) {
    if (!v) continue
    if (v === 'ok') toast.add({ severity: 'success', summary: t(`pos.bk.ok.${k}`), life: 2500 })
    else
      toast.add({
        severity: 'error',
        summary: v === 'NEED_SIGN_IN' ? t('pos.bk.needSignIn') : v === 'NEED_PERMISSION' ? t('pos.bk.needPermission') : v,
        life: 5000,
      })
  }
}

async function connect() {
  try {
    await signIn()
    await backupDrive()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e.message, life: 5000 })
  }
}
async function backupDrive() {
  // A tap renews an expired Google token (no popup if already allowed).
  if (!driveSignedIn.value) await signIn()
  report(await runBackup({ drive: true }))
  await refresh()
}
async function pickFolder() {
  try {
    await chooseFolder()
    report(await runBackup({ folder: true }))
    await refresh()
  } catch (e: any) {
    if (e?.name !== 'AbortError') toast.add({ severity: 'error', summary: e.message, life: 4000 })
  }
}
async function backupFolder() {
  if ((await folderPermission(true)) !== 'granted') return toast.add({ severity: 'warn', summary: t('pos.bk.needPermission'), life: 4000 })
  report(await runBackup({ folder: true }))
  await refresh()
}
async function download() {
  const name = await downloadBackupFile()
  toast.add({ severity: 'success', summary: t('pos.home.downloaded'), detail: name, life: 3000 })
  await refresh()
}
async function afterRestore() {
  history.replaceState(null, '', '/pos/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold">{{ t('pos.nav.backup') }}</h1>
      <p class="text-sm text-[var(--k-muted)]">{{ t('pos.bk.intro') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <i class="pi text-2xl" :class="isDirty() ? 'pi-exclamation-circle text-amber-600' : 'pi-check-circle text-primary-600'" />
      <div class="flex-1">
        <div class="font-semibold">{{ t('pos.bk.last', { when: lastText }) }}</div>
        <div class="text-sm text-[var(--k-muted)]">{{ isDirty() ? t('pos.bk.dirty') : t('pos.bk.clean') }}</div>
      </div>
      <i v-if="backupState.running" class="pi pi-spin pi-spinner" />
    </div>
    <Message v-if="backupState.lastError" severity="error" :closable="false">{{ backupState.lastError }}</Message>

    <!-- Google Drive -->
    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-google text-xl" />
        <h2 class="flex-1 font-semibold">Google Drive</h2>
        <Tag v-if="driveSignedIn" severity="success" :value="t('pos.bk.connected')" />
      </div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.bk.driveBody') }}</p>
      <Message v-if="!driveConfigured" severity="secondary" :closable="false">{{ t('pos.bk.driveNotConfigured') }}</Message>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="!driveSignedIn" :label="t('pos.bk.connect')" icon="pi pi-link" @click="connect" />
          <template v-else>
            <Button :label="t('pos.bk.backupNow')" icon="pi pi-cloud-upload" :loading="backupState.running" @click="backupDrive" />
            <Button :label="t('pos.bk.disconnect')" text severity="secondary" @click="signOut" />
          </template>
          <span class="flex-1" />
          <label class="flex items-center gap-2 text-sm">
            <ToggleSwitch :model-value="backupState.autoDrive" @update:model-value="(v: boolean) => setAuto('drive', v)" />
            {{ t('pos.bk.auto') }}
          </label>
        </div>
        <p class="mt-2 text-xs text-[var(--k-muted)]">{{ t('pos.bk.driveAutoNote') }} · {{ t('pos.bk.lastDrive', { when: when(backupState.lastDriveAt) }) }}</p>
        <details v-if="driveFiles?.length" class="mt-2 text-sm">
          <summary class="cursor-pointer text-[var(--k-muted)]">{{ t('pos.bk.driveFiles', { n: driveFiles.length }) }}</summary>
          <ul class="mt-1 max-h-48 overflow-y-auto">
            <li v-for="f in driveFiles" :key="f.id" class="flex justify-between border-t border-[var(--k-border)] py-1">
              <span>{{ f.name }}</span><span class="text-[var(--k-muted)]">{{ formatBytes(Number(f.size || 0)) }}</span>
            </li>
          </ul>
        </details>
      </template>
    </section>

    <SyncPanel />

    <!-- PC folder -->
    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-folder text-xl" />
        <h2 class="flex-1 font-semibold">{{ t('pos.bk.folderTitle') }}</h2>
        <Tag v-if="folderName" :severity="folderPerm === 'granted' ? 'success' : 'warn'" :value="folderName" />
      </div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.bk.folderBody') }}</p>
      <Message v-if="!folderSupported" severity="secondary" :closable="false">{{ t('pos.bk.folderUnsupported') }}</Message>
      <div v-else class="flex flex-wrap items-center gap-2">
        <Button v-if="!folderName" :label="t('pos.bk.chooseFolder')" icon="pi pi-folder-open" @click="pickFolder" />
        <template v-else>
          <Button :label="folderPerm === 'granted' ? t('pos.bk.backupNow') : t('pos.bk.allowAgain')" icon="pi pi-save" :loading="backupState.running" @click="backupFolder" />
          <Button :label="t('pos.bk.changeFolder')" text @click="pickFolder" />
          <Button :label="t('pos.bk.forget')" text severity="secondary" @click="forgetFolder().then(refresh)" />
        </template>
        <span class="flex-1" />
        <label v-if="folderName" class="flex items-center gap-2 text-sm">
          <ToggleSwitch :model-value="backupState.autoFolder" @update:model-value="(v: boolean) => setAuto('folder', v)" />
          {{ t('pos.bk.auto') }}
        </label>
      </div>
    </section>

    <!-- Download -->
    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-download text-xl" />
        <h2 class="font-semibold">{{ t('pos.bk.downloadTitle') }}</h2>
      </div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.bk.downloadBody') }}</p>
      <Button :label="t('pos.home.download')" icon="pi pi-download" outlined @click="download" />
    </section>

    <!-- Restore -->
    <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-history text-xl" />
        <h2 class="flex-1 font-semibold">{{ t('pos.bk.restoreTitle') }}</h2>
        <Button v-if="!restoreOpen" :label="t('pos.bk.restoreOpen')" text @click="restoreOpen = true" />
      </div>
      <RestorePanel v-if="restoreOpen" @restored="afterRestore" />
    </section>

    <section v-if="log.length">
      <h2 class="mb-2 font-semibold">{{ t('pos.bk.history') }}</h2>
      <ul class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] text-sm">
        <li v-for="l in log" :key="l.created_at" class="flex items-center gap-2 px-3 py-2">
          <i :class="l.status === 'OK' ? 'pi pi-check text-primary-600' : 'pi pi-times text-red-600'" />
          <span class="w-20 text-[var(--k-muted)]">{{ t(`pos.bk.target.${l.target.toLowerCase()}`) }}</span>
          <span class="flex-1 truncate">{{ l.error || l.file_name }}</span>
          <span class="text-[var(--k-muted)]">{{ formatBytes(l.bytes) }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ new Date(l.created_at).toLocaleString() }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
