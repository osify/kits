<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import ToggleSwitch from 'primevue/toggleswitch'
import InputNumber from 'primevue/inputnumber'
import MoneyInput from './MoneyInput.vue'
import ImagePicker from './ImagePicker.vue'
import { saveItem, setItemModifierGroups, checkItemLimit, type Item } from '../db/catalog'
import { limitFor } from '@/core/license'
import { useCatalogStore, localName } from '../stores/catalog'

const props = defineProps<{ item: Item | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t, locale } = useI18n()
const toast = useToast()
const cat = useCatalogStore()

const f = reactive({
  id: '' as string | undefined,
  name: '',
  name_km: '',
  category_id: null as string | null,
  price: 0 as number | null,
  cost: null as number | null,
  sku: '',
  barcode: '',
  icon: '',
  image_path: null as string | null,
  active: true,
  track_stock: false,
  low_stock: null as number | null,
  groups: [] as string[],
})
const saving = ref(false)

watch(visible, (v) => {
  if (!v) return
  const i = props.item
  Object.assign(f, {
    id: i?.id,
    name: i?.name ?? '',
    name_km: i?.name_km ?? '',
    category_id: i?.category_id ?? null,
    price: i?.price ?? 0,
    cost: i?.cost ?? null,
    sku: i?.sku ?? '',
    barcode: i?.barcode ?? '',
    icon: i?.icon ?? '',
    image_path: i?.image_path ?? null,
    active: i ? !!i.active : true,
    track_stock: !!i?.track_stock,
    low_stock: i?.low_stock ?? null,
    groups: i ? (cat.itemGroups.get(i.id) ?? []) : [],
  })
})

const catOptions = computed(() => cat.categories.map((c) => ({ label: `${c.icon ?? ''} ${localName(c, locale.value)}`.trim(), value: c.id })))
const groupOptions = computed(() => cat.groups.map((g) => ({ label: localName(g, locale.value), value: g.id })))
const color = computed(() => (f.category_id ? cat.categoryById.get(f.category_id)?.color : null) ?? null)
const valid = computed(() => (f.name.trim() || f.name_km.trim()) && f.price != null)

async function save() {
  if (!valid.value) return
  // Free plan: limited number of items on sale (new item, or un-hiding one).
  if (f.active && (!props.item || !props.item.active)) {
    const lim = await checkItemLimit(1, limitFor('items'))
    if (!lim.ok) {
      toast.add({ severity: 'warn', summary: t('pos.plan.limitReached', { max: lim.max }), detail: t('pos.plan.limitHow'), life: 7000 })
      return
    }
  }
  saving.value = true
  try {
    const id = await saveItem({
      id: f.id,
      name: f.name.trim() || f.name_km.trim(),
      name_km: f.name_km.trim() || null,
      category_id: f.category_id,
      price: f.price ?? 0,
      cost: f.cost,
      sku: f.sku.trim() || null,
      barcode: f.barcode.trim() || null,
      icon: f.icon.trim() || null,
      image_path: f.image_path,
      active: f.active ? 1 : 0,
      track_stock: f.track_stock ? 1 : 0,
      low_stock: f.track_stock ? f.low_stock : null,
      sort: props.item?.sort,
    })
    await setItemModifierGroups(id, f.groups)
    emit('saved')
    visible.value = false
  } catch (e: any) {
    toast.add({ severity: 'error', summary: /UNIQUE/.test(e.message) ? t('pos.setup.barcodeTaken') : e.message, life: 4000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="item ? t('pos.setup.editItem') : t('pos.setup.newItem')" class="w-[min(36rem,calc(100vw-1.5rem))]">
    <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
      <div class="sm:col-span-2">
        <ImagePicker v-model="f.image_path" :icon="f.icon" :name="f.name || f.name_km" :color="color" />
      </div>
      <label class="field">
        <span>{{ t('pos.c.nameKm') }}</span>
        <InputText v-model="f.name_km" lang="km" />
      </label>
      <label class="field">
        <span>{{ t('pos.c.nameEn') }}</span>
        <InputText v-model="f.name" lang="en" />
      </label>
      <label class="field">
        <span>{{ t('pos.c.price') }}</span>
        <MoneyInput v-model="f.price" />
      </label>
      <label class="field">
        <span>{{ t('pos.c.category') }}</span>
        <Select v-model="f.category_id" :options="catOptions" option-label="label" option-value="value" show-clear :placeholder="t('pos.c.none')" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.icon') }}</span>
        <InputText v-model="f.icon" maxlength="4" placeholder="☕" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.cost') }} <small class="text-[var(--k-muted)]">({{ t('pos.c.optional') }})</small></span>
        <MoneyInput v-model="f.cost" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.barcode') }}</span>
        <InputText v-model="f.barcode" inputmode="numeric" />
      </label>
      <label class="field">
        <span>{{ t('pos.setup.sku') }}</span>
        <InputText v-model="f.sku" />
      </label>
      <label class="field sm:col-span-2">
        <span>{{ t('pos.setup.addonsFor') }}</span>
        <MultiSelect v-model="f.groups" :options="groupOptions" option-label="label" option-value="value" display="chip" :placeholder="t('pos.c.none')" />
      </label>
      <label class="flex items-center gap-2">
        <ToggleSwitch v-model="f.track_stock" />
        <span>{{ t('pos.stock.trackThis') }}</span>
      </label>
      <label v-if="f.track_stock" class="field">
        <span>{{ t('pos.stock.lowAlert') }}</span>
        <InputNumber v-model="f.low_stock" :min="0" :max-fraction-digits="2" />
      </label>
      <label class="flex items-center gap-2 sm:col-span-2">
        <ToggleSwitch v-model="f.active" />
        <span>{{ t('pos.setup.onSale') }}</span>
      </label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.c.save')" icon="pi pi-check" :loading="saving" :disabled="!valid" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
</style>
