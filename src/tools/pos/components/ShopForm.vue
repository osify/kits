<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Textarea from 'primevue/textarea'
import ImagePicker from './ImagePicker.vue'
import { useShopStore } from '../stores/shop'
import type { Currency } from '@/core/util/money'

/** Shop details. `compact` = first-run wizard (name, currency, rate only). */
const props = defineProps<{ compact?: boolean; submitLabel?: string }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const toast = useToast()
const shop = useShopStore()
const saving = ref(false)

const f = reactive({
  name: '',
  phone: '',
  address: '',
  base_currency: 'KHR' as Currency,
  khr_per_usd: 4100 as number | null,
  show_dual: true,
  receipt_header: '',
  receipt_footer: '',
  paper_mm: 80,
  khqr_image: null as string | null,
  logo_image: null as string | null,
})

watch(
  () => shop.shop,
  (s) => {
    if (!s) return
    Object.assign(f, {
      name: s.name,
      phone: s.phone ?? '',
      address: s.address ?? '',
      base_currency: s.base_currency,
      khr_per_usd: s.khr_per_usd,
      show_dual: !!s.show_dual,
      receipt_header: s.receipt_header ?? '',
      receipt_footer: s.receipt_footer ?? '',
      paper_mm: s.paper_mm || 80,
      khqr_image: s.khqr_image,
      logo_image: s.logo_image,
    })
  },
  { immediate: true },
)

const currencyOptions = computed(() => [
  { label: t('pos.setup.riel'), value: 'KHR' },
  { label: t('pos.setup.dollar'), value: 'USD' },
])
const paperOptions = [
  { label: '58 mm', value: 58 },
  { label: '80 mm', value: 80 },
]

async function save() {
  if (!f.name.trim()) return
  saving.value = true
  try {
    await shop.save({
      name: f.name.trim(),
      base_currency: f.base_currency,
      khr_per_usd: f.khr_per_usd || 4100,
      show_dual: f.show_dual ? 1 : 0,
      ...(props.compact
        ? {}
        : {
            phone: f.phone.trim() || null,
            address: f.address.trim() || null,
            receipt_header: f.receipt_header.trim() || null,
            receipt_footer: f.receipt_footer.trim() || null,
            paper_mm: f.paper_mm,
            khqr_image: f.khqr_image,
            logo_image: f.logo_image,
          }),
    })
    if (!props.compact) toast.add({ severity: 'success', summary: t('pos.c.saved'), life: 2000 })
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
    <label class="field sm:col-span-2">
      <span>{{ t('pos.home.shopName') }}</span>
      <InputText v-model="f.name" :placeholder="t('pos.home.shopNamePh')" maxlength="80" autofocus />
    </label>
    <div class="field">
      <span>{{ t('pos.home.currency') }}</span>
      <SelectButton v-model="f.base_currency" :options="currencyOptions" option-label="label" option-value="value" :allow-empty="false" />
    </div>
    <label class="field">
      <span>{{ t('pos.home.rate') }}</span>
      <InputNumber v-model="f.khr_per_usd" :min="1000" :max="10000" suffix=" ៛" />
    </label>
    <label class="flex items-center gap-2 sm:col-span-2">
      <ToggleSwitch v-model="f.show_dual" />
      <span>{{ t('pos.setup.showDual') }}</span>
    </label>

    <template v-if="!compact">
      <label class="field">
        <span>{{ t('pos.setup.phone') }}</span>
        <InputText v-model="f.phone" inputmode="tel" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.address') }}</span>
        <InputText v-model="f.address" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.receiptHeader') }}</span>
        <Textarea v-model="f.receipt_header" rows="2" auto-resize />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.receiptFooter') }}</span>
        <Textarea v-model="f.receipt_footer" rows="2" auto-resize :placeholder="t('pos.sell.thanks')" />
      </label>
      <div class="field">
        <span>{{ t('pos.setup.paper') }}</span>
        <SelectButton v-model="f.paper_mm" :options="paperOptions" option-label="label" option-value="value" :allow-empty="false" />
      </div>
      <div class="field sm:col-span-2">
        <span>{{ t('pos.setup.logo') }}</span>
        <ImagePicker v-model="f.logo_image" icon="🏪" name="Logo" />
      </div>
      <div class="field sm:col-span-2">
        <span>{{ t('pos.setup.khqr') }}</span>
        <small class="text-[var(--k-muted)]">{{ t('pos.setup.khqrHint') }}</small>
        <ImagePicker v-model="f.khqr_image" icon="🔳" name="KHQR" />
      </div>
    </template>

    <div class="sm:col-span-2">
      <Button type="submit" :label="submitLabel || t('pos.c.save')" icon="pi pi-check" :loading="saving" :disabled="!f.name.trim()" />
    </div>
  </form>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
</style>
