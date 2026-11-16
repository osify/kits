<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Password from 'primevue/password'
import { clearBackupPassword, getBackupKey, setBackupPassword } from '@/core/privacy/crypto'
import type { ToolBackup } from '@/core/backup/toolBackup'
import { driveConfigured, driveSignedIn, signIn, signOut, type DriveFile } from '@/core/backup/drive'

/** Backup + restore screen for any tool built on createToolBackup(). */
const props = defineProps<{ backup: ToolBackup; driveFolder: string }>()
const emit = defineEmits<{ restored: [] }>()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const files = ref<DriveFile[] | null>(null)
const busy = ref(false)
const err = ref('')
const fileEl = ref<HTMLInputElement | null>(null)
const books = ref<DriveFile[] | null>(null)
const bookFiles = ref<DriveFile[] | null>(null)
const restoring = ref(false)
const b = props.backup

async function refresh() {
  if (driveSignedIn.value) files.value = await b.driveFiles().catch(() => null)
}
onMounted(async () => {
  await refresh()
  if (b.encryptable) encOn.value = !!(await getBackupKey(b.tool))
})

// ── Encrypted backups (private tools) ───────────────────────────────────────
const encOn = ref(false)
const enc = reactive({ open: false, pw: '', pw2: '' })
const encValid = () => enc.pw.length >= 8 && enc.pw === enc.pw2
async function saveEnc() {
  if (!encValid()) return
  await setBackupPassword(b.tool, enc.pw)
  Object.assign(enc, { open: false, pw: '', pw2: '' })
  encOn.value = true
  toast.add({ severity: 'success', summary: t('bk.encOnToast'), life: 3500 })
}
function offEnc() {
  confirm.require({
    message: t('bk.encOffConfirm'),
    acceptProps: { label: t('bk.encOff'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await clearBackupPassword(b.tool)
      encOn.value = false
    },
  })
}

// ── Password for restoring an encrypted backup ──────────────────────────────
const pw = reactive({ open: false, value: '', error: '', run: null as null | ((p: string) => Promise<void>) })
async function submitPw() {
  if (!pw.run || !pw.value) return
  busy.value = true
  pw.error = ''
  try {
    await pw.run(pw.value)
    pw.open = false
    emit('restored')
  } catch (e: any) {
    pw.error = e.message === 'BAD_PASSWORD' ? t('bk.badPassword') : e.message === 'NOT_BACKUP' ? t('bk.notBackup') : e.message
  } finally {
    busy.value = false
  }
}

async function toDrive() {
  try {
    if (!driveSignedIn.value) await signIn()
    await b.backupToDrive()
    toast.add({ severity: 'success', summary: t('bk.ok'), life: 2500 })
    await refresh()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e.message === 'NEED_SIGN_IN' ? t('bk.signInAgain') : e.message, life: 5000 })
  }
}
async function download() {
  const name = await b.downloadFile()
  toast.add({ severity: 'success', summary: t('bk.downloaded'), detail: name, life: 3000 })
}
function ask(what: string, run: (password?: string) => Promise<void>) {
  confirm.require({
    header: t('bk.restore'),
    message: t('bk.restoreConfirm', { what }),
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('bk.restoreNow'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      busy.value = true
      err.value = ''
      try {
        await run()
        emit('restored')
      } catch (e: any) {
        if (e.message === 'NEED_PASSWORD') return void Object.assign(pw, { open: true, value: '', error: '', run })
        err.value = e.message === 'NOT_BACKUP' ? t('bk.notBackup') : e.message
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
  const m = b.readManifest(bytes)
  ask(m ? `${m.book ?? ''} · ${new Date(m.created_at).toLocaleString()}` : f.name, (p) => b.restore(bytes, p))
}
async function fromDrive() {
  busy.value = true
  err.value = ''
  try {
    if (!driveSignedIn.value) await signIn()
    books.value = await b.driveBooks()
    if (books.value.length === 1) bookFiles.value = await b.driveBookFiles(books.value[0].id)
  } catch (e: any) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}
defineExpose({ openRestore: () => (restoring.value = true) })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card flex items-center gap-3">
      <i class="pi text-2xl" :class="b.isDirty() ? 'pi-exclamation-circle text-amber-600' : 'pi-check-circle text-primary-600'" />
      <div>
        <div class="font-semibold">{{ t('bk.last', { when: b.state.lastBackupAt ? new Date(b.state.lastBackupAt).toLocaleString() : t('bk.never') }) }}</div>
        <div class="text-sm text-[var(--k-muted)]">{{ b.isDirty() ? t('bk.dirty') : t('bk.clean') }}</div>
      </div>
    </div>

    <section class="card">
      <div class="mb-2 flex items-center gap-2">
        <i class="pi pi-google text-xl" />
        <h2 class="flex-1 font-semibold">Google Drive</h2>
        <Tag v-if="driveSignedIn" severity="success" :value="t('bk.connected')" />
      </div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('bk.driveBody', { folder: driveFolder }) }}</p>
      <Message v-if="!driveConfigured" severity="secondary" :closable="false">{{ t('bk.notConfigured') }}</Message>
      <div v-else class="flex flex-wrap gap-2">
        <Button :label="t('bk.backupNow')" icon="pi pi-cloud-upload" :loading="b.state.running" @click="toDrive" />
        <Button v-if="driveSignedIn" :label="t('bk.disconnect')" text severity="secondary" @click="signOut" />
      </div>
      <p v-if="files" class="mt-2 text-xs text-[var(--k-muted)]">{{ t('bk.inDrive', { n: files.length }) }}</p>
    </section>

    <section class="card">
      <div class="mb-2 flex items-center gap-2"><i class="pi pi-download text-xl" /><h2 class="font-semibold">{{ t('bk.downloadTitle') }}</h2></div>
      <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('bk.downloadBody') }}</p>
      <Button :label="t('bk.download')" icon="pi pi-download" outlined @click="download" />
    </section>

    <section v-if="b.encryptable" class="card flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <i class="pi pi-lock text-xl" />
        <h2 class="flex-1 font-semibold">{{ t('bk.encTitle') }}</h2>
        <Tag :severity="encOn ? 'success' : 'secondary'" :value="encOn ? t('bk.encOnTag') : t('bk.encOffTag')" />
      </div>
      <p class="text-sm text-[var(--k-muted)]">{{ t('bk.encBody') }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="encOn ? t('bk.encChange') : t('bk.encSet')" icon="pi pi-key" :outlined="encOn" @click="enc.open = true" />
        <Button v-if="encOn" :label="t('bk.encOff')" text severity="secondary" @click="offEnc" />
      </div>
    </section>

    <section class="card flex flex-col gap-3">
      <Button v-if="!restoring" :label="t('bk.restoreOpen')" icon="pi pi-history" text class="self-start" @click="restoring = true" />
      <template v-else>
        <h2 class="font-semibold">{{ t('bk.restore') }}</h2>
        <Message severity="warn" :closable="false">{{ t('bk.restoreWarn') }}</Message>
        <div class="flex flex-wrap gap-2">
          <Button :label="t('bk.fromFile')" icon="pi pi-upload" outlined :loading="busy" @click="fileEl?.click()" />
          <Button v-if="driveConfigured" :label="t('bk.fromDrive')" icon="pi pi-google" outlined :loading="busy" @click="fromDrive" />
        </div>
        <input ref="fileEl" type="file" accept=".zip,.kitroid,application/zip,application/octet-stream" hidden @change="onFile" />
        <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>
        <ul v-if="books && !bookFiles" class="flex flex-col gap-1">
          <li v-if="!books.length" class="text-sm text-[var(--k-muted)]">{{ t('bk.noneInDrive') }}</li>
          <li v-for="x in books" :key="x.id"><Button :label="x.name" icon="pi pi-folder" text @click="b.driveBookFiles(x.id).then((r) => (bookFiles = r))" /></li>
        </ul>
        <ul v-if="bookFiles" class="max-h-72 divide-y divide-[var(--k-border)] overflow-y-auto rounded-lg border border-[var(--k-border)]">
          <li v-if="!bookFiles.length" class="p-3 text-sm text-[var(--k-muted)]">{{ t('bk.noneInDrive') }}</li>
          <li v-for="f in bookFiles" :key="f.id">
            <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--k-border)]/40" @click="ask(new Date(f.createdTime).toLocaleString(), (p) => b.restoreFromDrive(f.id, p))">
              <i class="pi pi-history" /><span>{{ new Date(f.createdTime).toLocaleString() }}</span>
            </button>
          </li>
        </ul>
      </template>
    </section>

    <Dialog v-model:visible="enc.open" modal :header="t('bk.encTitle')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <Message severity="warn" :closable="false" class="text-sm">{{ t('bk.encWarn') }}</Message>
        <label class="field"><span>{{ t('bk.encPw') }}</span><Password v-model="enc.pw" toggle-mask :feedback="false" input-class="w-full" class="w-full" autocomplete="new-password" /></label>
        <label class="field"><span>{{ t('bk.encPw2') }}</span><Password v-model="enc.pw2" toggle-mask :feedback="false" input-class="w-full" class="w-full" autocomplete="new-password" /></label>
        <small class="text-[var(--k-muted)]">{{ t('bk.encRule') }}</small>
        <small v-if="enc.pw2 && enc.pw !== enc.pw2" class="text-red-600">{{ t('bk.encMismatch') }}</small>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="enc.open = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :disabled="!encValid()" @click="saveEnc" />
      </template>
    </Dialog>

    <Dialog v-model:visible="pw.open" modal :header="t('bk.pwTitle')" class="w-[min(24rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="submitPw">
        <p class="text-sm">{{ t('bk.pwBody') }}</p>
        <Password v-model="pw.value" toggle-mask :feedback="false" input-class="w-full" class="w-full" autofocus autocomplete="current-password" />
        <Message v-if="pw.error" severity="error" :closable="false">{{ pw.error }}</Message>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="pw.open = false" />
          <Button type="submit" :label="t('bk.restoreNow')" icon="pi pi-unlock" :loading="busy" :disabled="!pw.value" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
