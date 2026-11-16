<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { applyTemplate, fetchTemplate, fetchTemplateIndex, checkItemLimit, templateItemCount, type TemplateIndexEntry } from '../db/catalog'
import { limitFor } from '@/core/license'
import { useShopStore } from '../stores/shop'

/** Kitroid's recommended business setups (static JSON on kitroid.com, cached offline). */
const emit = defineEmits<{ applied: [id: string] }>()
const { t, locale } = useI18n()
const shop = useShopStore()
const list = ref<TemplateIndexEntry[]>([])
const error = ref('')
const busy = ref<string | null>(null)

onMounted(async () => {
  try {
    list.value = await fetchTemplateIndex()
  } catch (e: any) {
    error.value = e.message
  }
})

async function apply(id: string) {
  busy.value = id
  error.value = ''
  try {
    const tpl = await fetchTemplate(id)
    const adding = templateItemCount(tpl)
    const lim = await checkItemLimit(adding, limitFor('items'))
    if (!lim.ok) {
      error.value = t('pos.plan.templateTooBig', { n: adding, max: lim.max, used: lim.used })
      return
    }
    await applyTemplate(tpl, shop.base, shop.rate)
    if (shop.shop && !shop.shop.template_id) await shop.save({ name: shop.shop.name, template_id: id })
    emit('applied', id)
  } catch (e: any) {
    error.value = e.message
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <ul class="grid gap-3 sm:grid-cols-2">
      <li v-for="tp in list" :key="tp.id" class="flex flex-col gap-2 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl" aria-hidden="true">{{ tp.icon }}</span>
          <h3 class="font-semibold">{{ locale === 'km' ? tp.name_km : tp.name }}</h3>
        </div>
        <p class="flex-1 text-sm text-[var(--k-muted)]">{{ locale === 'km' ? tp.description_km : tp.description }}</p>
        <Button :label="t('pos.setup.useTemplate')" icon="pi pi-plus" size="small" outlined :loading="busy === tp.id" :disabled="!!busy" @click="apply(tp.id)" />
      </li>
    </ul>
  </div>
</template>
