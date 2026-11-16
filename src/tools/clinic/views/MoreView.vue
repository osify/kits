<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import QrCode from '@/components/QrCode.vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import BackupPanel from '@/components/BackupPanel.vue'
import SupportCard from '@/components/SupportCard.vue'
import PrivacyPanel from '@/components/PrivacyPanel.vue'
import { appLock as lock, backup, db, wipeClinic } from '../db'
import { clinicCard, clinicKey, patientsCsv } from '../db/data'
import { useClinic } from '../store'

/** Clinic profile (printed on papers), prescription privacy, export, privacy & lock, backup. */
const { t } = useI18n()
const toast = useToast()
const cl = useClinic()
const f = reactive({
  book_name: cl.settings.book_name ?? '',
  doctor: cl.settings.doctor ?? '',
  license: cl.settings.license ?? '',
  phone: cl.settings.phone ?? '',
  address: cl.settings.address ?? '',
})
async function save() {
  for (const [k, v] of Object.entries(f)) if ((cl.settings[k] ?? '') !== v.trim()) await cl.set(k, v.trim())
  card.value = await clinicCard(db) // the card carries the clinic name and phone
  toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
// ── Clinic card: pharmacies scan it once to trust this clinic's signed prescriptions ──
const confirm = useConfirm()
const card = ref<{ code: string; fingerprint: string } | null>(null)
const showCard = ref(false)
onMounted(async () => (card.value = await clinicCard(db)))
function newKey() {
  confirm.require({
    header: t('kx.newKey'),
    message: t('kx.newKeyConfirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('kx.newKey'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await clinicKey(db, true)
      card.value = await clinicCard(db)
    },
  })
}
async function exportPatients() {
  const url = URL.createObjectURL(new Blob([await patientsCsv(db)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kitroid-clinic-patients.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
function restored() {
  history.replaceState(null, '', '/clinic/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('cl.nav.more') }}</h1>
    <section class="card flex flex-col gap-3">
      <h2 class="font-semibold">{{ t('cl.profile') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('cl.profileHint') }}</p>
      <label class="field"><span>{{ t('cl.clinicName') }}</span><InputText v-model="f.book_name" /></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('cl.doctorName') }}</span><InputText v-model="f.doctor" :placeholder="t('cl.doctorPh')" /></label>
        <label class="field"><span>{{ t('cl.licenseNo') }}</span><InputText v-model="f.license" /></label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('cl.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
        <label class="field"><span>{{ t('cl.address') }}</span><InputText v-model="f.address" /></label>
      </div>
      <p class="text-sm">{{ t('cl.currency') }}: <b>{{ cl.currency }}</b></p>
      <Button :label="t('common.save')" icon="pi pi-check" class="self-start" @click="save" />
    </section>

    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold"><i class="pi pi-qrcode mr-1" />{{ t('cl.rxPrivacy') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('cl.shareContains') }}</p>
      <label class="flex items-center gap-2 text-sm">
        <ToggleSwitch :model-value="cl.settings.rx_name === '1'" @update:model-value="(x: boolean) => cl.set('rx_name', x ? '1' : '0')" />
        {{ t('cl.includeName') }}
      </label>
    </section>

    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold"><i class="pi pi-verified mr-1" />{{ t('kx.cardTitle') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('kx.cardBody') }}</p>
      <p v-if="card" class="text-sm">{{ t('kx.clinicKey') }}: <b class="font-mono">{{ card.fingerprint }}</b></p>
      <div class="flex flex-wrap gap-2">
        <Button :label="showCard ? t('kx.hideCard') : t('kx.showCard')" icon="pi pi-qrcode" outlined @click="showCard = !showCard" />
        <Button :label="t('kx.newKey')" icon="pi pi-refresh" text severity="secondary" @click="newKey" />
      </div>
      <div v-if="showCard && card" class="flex flex-col items-center gap-2 py-2">
        <QrCode :text="card.code" :size="240" :label="t('kx.cardTitle')" />
        <p class="text-center text-xs text-[var(--k-muted)]">{{ t('kx.cardHint') }}</p>
      </div>
    </section>

    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{{ t('cl.exportTitle') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('cl.exportBody') }}</p>
      <Button :label="t('cl.exportPatients')" icon="pi pi-file-excel" outlined class="self-start" @click="exportPatients" />
    </section>

    <PrivacyPanel :lock="lock" :wipe="wipeClinic" :what="t('cl.title')" />
    <h2 class="mt-2 text-lg font-semibold">{{ t('hl.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Clinic" @restored="restored" />
    <SupportCard class="mt-2" />
  </div>
</template>
