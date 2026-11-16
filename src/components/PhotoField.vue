<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { imageUrl, saveImage } from '@/core/files/images'

/** Pick or take a photo (resized, stored on this device under `tool`). v-model = stored path. */
const props = defineProps<{ tool: string }>()
const path = defineModel<string | null>({ default: null })
const { t } = useI18n()
const busy = ref(false)
const url = ref<string | null>(null)
const fileEl = ref<HTMLInputElement | null>(null)
const camEl = ref<HTMLInputElement | null>(null)
watchEffect(async () => (url.value = path.value ? await imageUrl(props.tool, path.value) : null))

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  busy.value = true
  try {
    path.value = (await saveImage(props.tool, f)).path
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <a v-if="url" :href="url" target="_blank" rel="noopener" class="shrink-0">
      <img :src="url" alt="" class="size-20 rounded-lg object-cover ring-1 ring-[var(--k-border)]" />
    </a>
    <span v-else class="grid size-20 shrink-0 place-items-center rounded-lg bg-[var(--k-border)]/40 text-2xl text-[var(--k-muted)]"><i class="pi pi-image" /></span>
    <div class="flex flex-col gap-1">
      <Button size="small" outlined icon="pi pi-image" :label="t('pos.setup.choosePhoto')" :loading="busy" @click="fileEl?.click()" />
      <Button size="small" outlined icon="pi pi-camera" :label="t('pos.setup.takePhoto')" :loading="busy" @click="camEl?.click()" />
      <Button v-if="path" size="small" text severity="danger" icon="pi pi-times" :label="t('pos.setup.removePhoto')" @click="path = null" />
    </div>
    <input ref="fileEl" type="file" accept="image/*" hidden @change="onFile" />
    <input ref="camEl" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
  </div>
</template>
