<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import BackupPanel from '@/components/BackupPanel.vue'
import SupportCard from '@/components/SupportCard.vue'
import PrivacyPanel from '@/components/PrivacyPanel.vue'
import { appLock as lock, backup, wipePayroll } from '../db'
import { usePayroll } from '../store'

/** Employer details printed on the return and payslips, defaults, privacy & lock, backup. */
const { t } = useI18n()
const toast = useToast()
const pr = usePayroll()
const f = reactive({
  book_name: pr.settings.book_name ?? '',
  tin: pr.settings.tin ?? '',
  nssf_no: pr.settings.nssf_no ?? '',
  phone: pr.settings.phone ?? '',
  address: pr.settings.address ?? '',
})
const rate = reactive({ v: pr.rate })
const curOpts = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
/** Saves changed fields; runs when leaving any field, and on the Save button. */
async function save() {
  let n = 0
  for (const [k, v] of Object.entries(f)) if ((pr.settings[k] ?? '') !== v.trim()) (await pr.set(k, v.trim()), n++)
  if (rate.v > 0 && String(rate.v) !== pr.settings.khr_per_usd) (await pr.set('khr_per_usd', String(rate.v)), n++)
  if (n) toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
function restored() {
  history.replaceState(null, '', '/payroll/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('pr.nav.more') }}</h1>
    <section class="card flex flex-col gap-3" @focusout="save">
      <h2 class="font-semibold">{{ t('pr.employer') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('pr.employerHint') }}</p>
      <label class="field"><span>{{ t('pr.bizName') }}</span><InputText v-model="f.book_name" /></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('pr.tin') }}</span><InputText v-model="f.tin" placeholder="K001-123456789" /></label>
        <label class="field"><span>{{ t('pr.employerNssf') }}</span><InputText v-model="f.nssf_no" /></label>
        <label class="field"><span>{{ t('pr.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
        <label class="field"><span>{{ t('pr.address') }}</span><InputText v-model="f.address" /></label>
      </div>
      <div class="field">
        <span>{{ t('pr.defaultCurrency') }}</span>
        <SelectButton :model-value="pr.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" @update:model-value="(v: string) => pr.set('currency', v)" />
      </div>
      <label class="field max-w-xs">
        <span>{{ t('pr.rate') }}</span>
        <InputNumber v-model="rate.v" :min="1" suffix=" ៛ / $1" @input="(e: any) => (rate.v = e.value)" />
      </label>
      <Button :label="t('common.save')" icon="pi pi-check" class="self-start" @click="save" />
    </section>

    <PrivacyPanel :lock="lock" :wipe="wipePayroll" :what="t('pr.title')" />
    <h2 class="mt-2 text-lg font-semibold">{{ t('hl.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Payroll" @restored="restored" />
    <SupportCard class="mt-2" />
  </div>
</template>
