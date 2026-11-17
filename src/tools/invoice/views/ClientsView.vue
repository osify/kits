<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import ClientDialog from '../components/ClientDialog.vue'
import { db } from '../db'
import { clientsCsv, createDoc, importClients, listClients, type ClientRow } from '../db/data'
import { formatMoney } from '@/core/util/money'
import { today } from '@/core/util/date'

/** Clients with what each still owes; import/export in the Customers CSV format. */
const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const rows = ref<ClientRow[]>([])
const search = ref('')
const load = async () => (rows.value = await listClients(db, search.value))
onMounted(load)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 200)
})
const open = ref(false)
const edit = ref<ClientRow | null>(null)
function openClient(c?: ClientRow) {
  edit.value = c ?? null
  open.value = true
}
async function invoice(c: ClientRow) {
  router.push(`/d/${await createDoc(db, 'INVOICE', today(), c.id)}`)
}
const fileEl = ref<HTMLInputElement | null>(null)
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  try {
    const r = await importClients(db, await f.text())
    toast.add({ severity: 'success', summary: t('iv.imported', r), life: 3000 })
    await load()
  } catch {
    toast.add({ severity: 'error', summary: t('iv.importNoName'), life: 4000 })
  }
}
async function exportCsv() {
  const url = URL.createObjectURL(new Blob([await clientsCsv(db)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kitroid-clients.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('iv.nav.clients') }}</h1>
      <Button :label="t('iv.newClient')" icon="pi pi-user-plus" @click="openClient()" />
    </div>
    <IconField>
      <InputIcon class="pi pi-search" />
      <InputText v-model="search" :placeholder="t('iv.searchClients')" class="w-full" />
    </IconField>
    <p v-if="!rows.length" class="py-10 text-center text-[var(--k-muted)]">{{ t('iv.noClients') }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="c in rows" :key="c.id" class="card flex items-center gap-3">
        <button type="button" class="min-w-0 flex-1 text-left" @click="openClient(c)">
          <span class="block truncate font-semibold">{{ c.company || c.name }}</span>
          <span class="block truncate text-xs text-[var(--k-muted)]">{{ [c.company ? c.name : '', c.phone, c.vat_tin ? `VATTIN ${c.vat_tin}` : ''].filter(Boolean).join(' · ') }}</span>
        </button>
        <span class="flex flex-col items-end gap-1 text-sm">
          <span v-if="c.owing_usd" class="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{{ t('iv.owes', { amount: formatMoney(c.owing_usd, 'USD') }) }}</span>
          <span v-if="c.owing_khr" class="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{{ t('iv.owes', { amount: formatMoney(c.owing_khr, 'KHR') }) }}</span>
          <span class="flex gap-1">
            <RouterLink v-if="c.docs" :to="`/?client=${c.id}`" class="text-xs underline">{{ t('iv.nDocs', { n: c.docs }) }}</RouterLink>
          </span>
        </span>
        <Button icon="pi pi-file-plus" text rounded :aria-label="t('iv.newInvoice')" @click="invoice(c)" />
      </li>
    </ul>
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('iv.csvTitle') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('iv.csvBody') }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="t('iv.importCsv')" icon="pi pi-upload" outlined @click="fileEl?.click()" />
        <Button :label="t('iv.exportCsv')" icon="pi pi-download" outlined :disabled="!rows.length" @click="exportCsv" />
      </div>
      <input ref="fileEl" type="file" accept=".csv,text/csv" hidden @change="onFile" />
    </section>
    <ClientDialog v-model:open="open" :client="edit" @saved="load" />
  </div>
</template>
