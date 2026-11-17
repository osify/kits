<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import BackupPanel from '@/components/BackupPanel.vue'
import SupportCard from '@/components/SupportCard.vue'
import PhotoField from '@/components/PhotoField.vue'
import { backup } from '../db'
import { useInvoice } from '../store'

/** Business profile printed on papers, payment details + KHQR, defaults for new documents, backup. */
const { t } = useI18n()
const toast = useToast()
const iv = useInvoice()
const s = iv.settings
const f = reactive({
  book_name: s.book_name ?? '',
  name_en: s.name_en ?? '',
  vat_tin: s.vat_tin ?? '',
  phone: s.phone ?? '',
  email: s.email ?? '',
  address: s.address ?? '',
  pay_info: s.pay_info ?? '',
  invoice_terms: s.invoice_terms ?? '',
  quote_terms: s.quote_terms ?? '',
  inv_prefix: s.inv_prefix ?? 'INV',
  qt_prefix: s.qt_prefix ?? 'QT',
})
const nums = reactive({ khr_per_usd: Number(s.khr_per_usd || 4100), due_days: Number(s.due_days || 7), valid_days: Number(s.valid_days || 30) })
const curOpts = [
  { label: '$ USD', value: 'USD' },
  { label: '៛ KHR', value: 'KHR' },
]
/** Saves changed fields; runs when leaving any field, and on the Save button. */
async function save() {
  let n = 0
  for (const [k, v] of Object.entries(f)) if ((iv.settings[k] ?? '') !== v.trim()) (await iv.set(k, v.trim()), n++)
  for (const [k, v] of Object.entries(nums)) if (v > 0 && String(v) !== iv.settings[k]) (await iv.set(k, String(v)), n++)
  if (n) toast.add({ severity: 'success', summary: t('common.saved'), life: 1500 })
}
const setPhoto = (k: 'logo' | 'khqr', v: string | null) => iv.set(k, v ?? '')
function restored() {
  history.replaceState(null, '', '/invoice/#/')
  location.reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('iv.nav.more') }}</h1>
    <section class="card flex flex-col gap-3" @focusout="save">
      <h2 class="font-semibold">{{ t('iv.profile') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('iv.profileHint') }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="field"><span>{{ t('iv.bizName') }}</span><InputText v-model="f.book_name" /></label>
        <label class="field"><span>{{ t('iv.bizNameEn') }}</span><InputText v-model="f.name_en" /></label>
        <label class="field"><span>{{ t('iv.vatTin') }}</span><InputText v-model="f.vat_tin" placeholder="K001-123456789" /></label>
        <label class="field"><span>{{ t('iv.phone') }}</span><InputText v-model="f.phone" inputmode="tel" /></label>
        <label class="field"><span>{{ t('iv.email') }}</span><InputText v-model="f.email" inputmode="email" /></label>
      </div>
      <label class="field"><span>{{ t('iv.address') }}</span><Textarea v-model="f.address" rows="2" auto-resize /></label>
      <div class="field"><span>{{ t('iv.logo') }}</span><PhotoField :model-value="iv.settings.logo || null" tool="invoice" @update:model-value="(v) => setPhoto('logo', v)" /></div>
    </section>

    <section class="card flex flex-col gap-3" @focusout="save">
      <h2 class="font-semibold">{{ t('iv.payInfo') }}</h2>
      <p class="text-sm text-[var(--k-muted)]">{{ t('iv.payInfoHint') }}</p>
      <Textarea v-model="f.pay_info" rows="3" auto-resize :placeholder="t('iv.payInfoPh')" />
      <div class="field"><span>{{ t('iv.khqr') }}</span><PhotoField :model-value="iv.settings.khqr || null" tool="invoice" @update:model-value="(v) => setPhoto('khqr', v)" /></div>
    </section>

    <section class="card flex flex-col gap-3" @focusout="save">
      <h2 class="font-semibold">{{ t('iv.defaults') }}</h2>
      <div class="field">
        <span>{{ t('iv.defaultCurrency') }}</span>
        <SelectButton :model-value="iv.currency" :options="curOpts" option-label="label" option-value="value" :allow-empty="false" @update:model-value="(v: string) => iv.set('currency', v)" />
      </div>
      <label class="flex items-center gap-2 text-sm">
        <ToggleSwitch :model-value="iv.settings.vat_rate === '10'" @update:model-value="(x: boolean) => iv.set('vat_rate', x ? '10' : '0')" />
        {{ t('iv.vatDefault') }}
      </label>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="field"><span>{{ t('iv.rate') }}</span><InputNumber v-model="nums.khr_per_usd" :min="1" suffix=" ៛" @input="(e: any) => (nums.khr_per_usd = e.value)" /></label>
        <label class="field"><span>{{ t('iv.dueDays') }}</span><InputNumber v-model="nums.due_days" :min="0" @input="(e: any) => (nums.due_days = e.value)" /></label>
        <label class="field"><span>{{ t('iv.validDays') }}</span><InputNumber v-model="nums.valid_days" :min="0" @input="(e: any) => (nums.valid_days = e.value)" /></label>
        <label class="field"><span>{{ t('iv.invPrefix') }}</span><InputText v-model="f.inv_prefix" /></label>
        <label class="field"><span>{{ t('iv.qtPrefix') }}</span><InputText v-model="f.qt_prefix" /></label>
      </div>
      <label class="field"><span>{{ t('iv.invoiceTerms') }}</span><Textarea v-model="f.invoice_terms" rows="2" auto-resize :placeholder="t('iv.invoiceTermsPh')" /></label>
      <label class="field"><span>{{ t('iv.quoteTerms') }}</span><Textarea v-model="f.quote_terms" rows="2" auto-resize :placeholder="t('iv.quoteTermsPh')" /></label>
      <Button :label="t('common.save')" icon="pi pi-check" class="self-start" @click="save" />
    </section>

    <h2 class="mt-2 text-lg font-semibold">{{ t('hl.backup') }}</h2>
    <BackupPanel :backup="backup" drive-folder="Kitroid / Invoices" @restored="restored" />
    <SupportCard class="mt-2" />
  </div>
</template>
