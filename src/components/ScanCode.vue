<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'

/**
 * Read a Kitroid code: live camera (BarcodeDetector where the browser has it, else the bundled
 * jsQR decoder, loaded only when needed), a photo of the paper, or pasted text (e.g. from Telegram).
 * Everything happens on the device; nothing is uploaded. Emits the raw text.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ title: string }>()
const emit = defineEmits<{ code: [text: string] }>()
const { t } = useI18n()
const video = ref<HTMLVideoElement | null>(null)
const pasted = ref('')
const err = ref('')
const camOn = ref(false)
const fileEl = ref<HTMLInputElement | null>(null)
let stream: MediaStream | null = null
let timer = 0
let detector: any = null
let canvas: HTMLCanvasElement | null = null

async function decodeImage(src: CanvasImageSource, w: number, h: number): Promise<string | null> {
  if ('BarcodeDetector' in window) {
    try {
      detector ??= new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      const r = await detector.detect(src)
      if (r[0]?.rawValue) return r[0].rawValue
      return null
    } catch {
      /* fall back to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr')
  canvas ??= document.createElement('canvas')
  const scale = Math.min(1, 1000 / Math.max(w, h))
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(img.data, img.width, img.height)?.data ?? null
}

async function startCam() {
  err.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    camOn.value = true
    await new Promise((r) => setTimeout(r, 50))
    if (!video.value) return
    video.value.srcObject = stream
    await video.value.play()
    const tick = async () => {
      if (!camOn.value || !video.value) return
      const v = video.value
      if (v.readyState >= 2) {
        const text = await decodeImage(v, v.videoWidth, v.videoHeight).catch(() => null)
        if (text) return done(text)
      }
      timer = window.setTimeout(tick, 250)
    }
    tick()
  } catch {
    err.value = t('kx.noCamera')
    stopCam()
  }
}
function stopCam() {
  camOn.value = false
  clearTimeout(timer)
  stream?.getTracks().forEach((tr) => tr.stop())
  stream = null
}
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  err.value = ''
  const bmp = await createImageBitmap(f)
  const text = await decodeImage(bmp, bmp.width, bmp.height).catch(() => null)
  if (text) done(text)
  else err.value = t('kx.noQrInPhoto')
}
function done(text: string) {
  stopCam()
  open.value = false
  emit('code', text)
}
function usePasted() {
  if (pasted.value.trim()) done(pasted.value.trim())
}
watch(open, (v) => {
  if (v) {
    pasted.value = ''
    err.value = ''
  } else stopCam()
})
onBeforeUnmount(stopCam)
</script>

<template>
  <Dialog v-model:visible="open" modal :header="props.title" class="w-[min(28rem,calc(100vw-1rem))]">
    <div class="flex flex-col gap-3">
      <div v-show="camOn" class="relative overflow-hidden rounded-xl bg-black">
        <video ref="video" class="aspect-square w-full object-cover" playsinline muted />
        <div class="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-white/80" />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button v-if="!camOn" :label="t('kx.camera')" icon="pi pi-camera" @click="startCam" />
        <Button v-else :label="t('kx.stopCamera')" icon="pi pi-stop" severity="secondary" @click="stopCam" />
        <Button :label="t('kx.photo')" icon="pi pi-image" outlined @click="fileEl?.click()" />
      </div>
      <input ref="fileEl" type="file" accept="image/*" hidden @change="onFile" />
      <label class="field">
        <span>{{ t('kx.paste') }}</span>
        <Textarea v-model="pasted" rows="3" class="font-mono text-xs" placeholder="KX1.rx.…" />
      </label>
      <Button :label="t('kx.use')" icon="pi pi-check" :disabled="!pasted.trim()" class="self-start" @click="usePasted" />
      <Message v-if="err" severity="warn" :closable="false">{{ err }}</Message>
      <p class="text-xs text-[var(--k-muted)]">{{ t('kx.onDevice') }}</p>
    </div>
  </Dialog>
</template>
