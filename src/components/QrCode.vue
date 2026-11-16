<script setup lang="ts">
import { computed } from 'vue'
import qrcode from 'qrcode-generator'

/** QR code as crisp SVG (prints well on receipts and A4). Dark modules on white, quiet zone 4. */
const props = defineProps<{ text: string; size?: number; label?: string }>()
const qr = computed(() => {
  const q = qrcode(0, 'M')
  q.addData(props.text, 'Byte')
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`
  return { n: n + 8, d }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${qr.n} ${qr.n}`"
    :width="size ?? 160"
    :height="size ?? 160"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="label ?? 'QR code'"
    class="rounded bg-white"
  >
    <rect :width="qr.n" :height="qr.n" fill="#fff" />
    <path :d="qr.d" fill="#000" />
  </svg>
</template>
