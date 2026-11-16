<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { saveCategory, type Category } from '../db/catalog'

const props = defineProps<{ category: Category | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()

// Distinct, readable on light and dark surfaces
const COLORS = ['#b45309', '#b91c1c', '#be123c', '#7c3aed', '#4f46e5', '#0e7490', '#0f766e', '#15803d', '#4d7c0f', '#a16207', '#475569']
const f = reactive({ name: '', name_km: '', icon: '', color: COLORS[0] })
const saving = ref(false)

watch(visible, (v) => {
  if (!v) return
  const c = props.category
  Object.assign(f, { name: c?.name ?? '', name_km: c?.name_km ?? '', icon: c?.icon ?? '', color: c?.color ?? COLORS[0] })
})
const valid = computed(() => !!(f.name.trim() || f.name_km.trim()))

async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    await saveCategory({
      id: props.category?.id,
      name: f.name.trim() || f.name_km.trim(),
      name_km: f.name_km.trim() || null,
      icon: f.icon.trim() || null,
      color: f.color,
      sort: props.category?.sort,
      active: props.category?.active ?? 1,
    })
    emit('saved')
    visible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="category ? t('pos.setup.editCategory') : t('pos.setup.newCategory')" class="w-[min(28rem,calc(100vw-1.5rem))]">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.nameKm') }}</span><InputText v-model="f.name_km" lang="km" /></label>
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.nameEn') }}</span><InputText v-model="f.name" /></label>
      <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.setup.icon') }}</span><InputText v-model="f.icon" maxlength="4" placeholder="☕" /></label>
      <fieldset class="flex flex-col gap-1 text-sm">
        <legend>{{ t('pos.setup.color') }}</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            class="size-8 rounded-full ring-offset-2 ring-offset-[var(--k-surface)]"
            :class="{ 'ring-2 ring-[var(--k-text)]': f.color === c }"
            :style="{ background: c }"
            :aria-label="c"
            :aria-pressed="f.color === c"
            @click="f.color = c"
          />
        </div>
      </fieldset>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.c.save')" icon="pi pi-check" :loading="saving" :disabled="!valid" @click="save" />
    </template>
  </Dialog>
</template>
