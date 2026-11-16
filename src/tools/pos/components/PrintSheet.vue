<script setup lang="ts">
import { nextTick, watch } from 'vue'

/**
 * Prints its slot (and only its slot) through the browser print dialog.
 * Works with any printer the OS knows, including 58/80 mm USB/Bluetooth thermal
 * printers set up as system printers. Set `open` to true to print.
 */
const props = defineProps<{ paperMm?: number }>()
const open = defineModel<boolean>('open', { default: false })

watch(open, async (v) => {
  if (!v) return
  document.documentElement.style.setProperty('--paper-mm', `${props.paperMm || 80}mm`)
  document.body.classList.add('printing-sheet')
  await nextTick()
  // let images (logo, KHQR) decode before the print snapshot
  await new Promise((r) => setTimeout(r, 150))
  const done = () => {
    document.body.classList.remove('printing-sheet')
    open.value = false
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
  // Some mobile browsers never fire afterprint
  setTimeout(() => open.value && done(), 1500)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="print-sheet" :style="{ width: `${paperMm || 80}mm` }">
      <slot />
    </div>
  </Teleport>
</template>

<style>
.print-sheet {
  position: fixed;
  left: -10000px;
  top: 0;
  background: #fff;
  color: #000;
}
@media print {
  @page {
    margin: 2mm;
  }
  body.printing-sheet > *:not(.print-sheet) {
    display: none !important;
  }
  body.printing-sheet {
    background: #fff !important;
  }
  body.printing-sheet .print-sheet {
    position: static;
    display: block;
    max-width: 100%;
  }
}
</style>
