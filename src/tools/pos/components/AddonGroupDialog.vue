<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import MoneyInput from './MoneyInput.vue'
import { saveModifierGroup, type ModifierGroup } from '../db/catalog'

/** Add-on group, e.g. "Sugar" with options "No sugar / 50% / Normal". */
const props = defineProps<{ group: ModifierGroup | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()

interface Opt {
  id?: string
  name: string
  name_km: string
  price_delta: number | null
}
const f = reactive({ name: '', name_km: '', min_select: 0, max_select: 1, options: [] as Opt[] })
const saving = ref(false)

watch(visible, (v) => {
  if (!v) return
  const g = props.group
  Object.assign(f, {
    name: g?.name ?? '',
    name_km: g?.name_km ?? '',
    min_select: g?.min_select ?? 0,
    max_select: g?.max_select ?? 1,
    options: g ? g.options.map((o) => ({ id: o.id, name: o.name, name_km: o.name_km ?? '', price_delta: o.price_delta })) : [{ name: '', name_km: '', price_delta: 0 }],
  })
})

const valid = computed(() => (f.name.trim() || f.name_km.trim()) && f.options.some((o) => o.name.trim() || o.name_km.trim()))

async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    await saveModifierGroup({
      id: props.group?.id,
      name: f.name.trim() || f.name_km.trim(),
      name_km: f.name_km.trim() || null,
      min_select: Math.min(f.min_select, f.max_select),
      max_select: Math.max(1, f.max_select),
      options: f.options
        .filter((o) => o.name.trim() || o.name_km.trim())
        .map((o, i) => ({ id: o.id ?? '', group_id: props.group?.id ?? '', name: o.name.trim() || o.name_km.trim(), name_km: o.name_km.trim() || null, price_delta: o.price_delta ?? 0, sort: i })),
    })
    emit('saved')
    visible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="group ? t('pos.setup.editAddon') : t('pos.setup.newAddon')" class="w-[min(40rem,calc(100vw-1.5rem))]">
    <div class="flex flex-col gap-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.nameKm') }}</span><InputText v-model="f.name_km" placeholder="ស្ករ" /></label>
        <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.nameEn') }}</span><InputText v-model="f.name" placeholder="Sugar" /></label>
        <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.setup.minSel') }}</span><InputNumber v-model="f.min_select" :min="0" :max="10" show-buttons /></label>
        <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.setup.maxSel') }}</span><InputNumber v-model="f.max_select" :min="1" :max="10" show-buttons /></label>
      </div>
      <h3 class="font-semibold">{{ t('pos.setup.options') }}</h3>
      <div v-for="(o, i) in f.options" :key="i" class="grid grid-cols-[1fr_1fr_8rem_auto] items-center gap-2">
        <InputText v-model="o.name_km" :placeholder="t('pos.c.nameKm')" :aria-label="t('pos.c.nameKm')" />
        <InputText v-model="o.name" :placeholder="t('pos.c.nameEn')" :aria-label="t('pos.c.nameEn')" />
        <MoneyInput v-model="o.price_delta" :placeholder="'+0'" />
        <Button icon="pi pi-times" text severity="danger" :aria-label="t('pos.c.delete')" @click="f.options.splice(i, 1)" />
      </div>
      <Button :label="t('pos.setup.addOption')" icon="pi pi-plus" text class="self-start" @click="f.options.push({ name: '', name_km: '', price_delta: 0 })" />
    </div>
    <template #footer>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.c.save')" icon="pi pi-check" :loading="saving" :disabled="!valid" @click="save" />
    </template>
  </Dialog>
</template>
