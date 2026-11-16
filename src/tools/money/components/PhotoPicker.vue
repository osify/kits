<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { imageUrl, saveImage } from '@/core/files/images'

/** Receipt / invoice photo, resized and stored on the device. v-model = stored path. */
const path = defineModel<string | null>({ default: null })
const { t } = useI18n()
const busy = ref(false)
const url = ref<string | null>(null)
const fileEl = ref<HTMLInputElement | null>(null)
const camEl = ref<HTMLInputElement | null>(null)

watchEffect(async () => {
  url.value = path.value ? await imageUrl('money', path.value) : null
})

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  busy.value = true
  try {
    path.value = (await saveImage('money', f)).path
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <a v-if="url" :href="url" target="_blank" rel="noopener"><img :src="url" alt="" class="size-14 rounded-lg object-cover" /></a>
    <Button size="small" outlined icon="pi pi-camera" :label="t('money.takePhoto')" :loading="busy" @click="camEl?.click()" />
    <Button size="small" text icon="pi pi-image" :aria-label="t('money.choosePhoto')" @click="fileEl?.click()" />
    <Button v-if="path" size="small" text severity="danger" icon="pi pi-times" :aria-label="t('money.removePhoto')" @click="path = null" />
    <input ref="fileEl" type="file" accept="image/*" hidden @change="onFile" />
    <input ref="camEl" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
  </div>
</template>
