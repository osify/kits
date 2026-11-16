<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import ItemThumb from './ItemThumb.vue'
import { saveImage } from '@/core/files/images'

/** Pick or take a photo; it is resized and stored on the device. v-model = stored path. */
defineProps<{ icon?: string | null; name?: string; color?: string | null }>()
const path = defineModel<string | null>({ default: null })
const { t } = useI18n()
const busy = ref(false)
const fileEl = ref<HTMLInputElement | null>(null)
const camEl = ref<HTMLInputElement | null>(null)

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  busy.value = true
  try {
    path.value = (await saveImage('pos', f)).path
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <ItemThumb :path="path" :icon="icon" :name="name || '?'" :color="color" size="lg" />
    <div class="flex flex-col gap-1">
      <Button size="small" outlined icon="pi pi-image" :label="t('pos.setup.choosePhoto')" :loading="busy" @click="fileEl?.click()" />
      <Button size="small" outlined icon="pi pi-camera" :label="t('pos.setup.takePhoto')" :loading="busy" @click="camEl?.click()" />
      <Button v-if="path" size="small" text severity="danger" icon="pi pi-times" :label="t('pos.setup.removePhoto')" @click="path = null" />
    </div>
    <input ref="fileEl" type="file" accept="image/*" hidden @change="onFile" />
    <input ref="camEl" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
  </div>
</template>
