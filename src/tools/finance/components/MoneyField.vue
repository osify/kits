<script setup lang="ts">
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import { currency } from '../state'

/** Money input bound to minor units (riel, or USD cents) of the tool's currency. */
defineProps<{ inputId?: string; placeholder?: string }>()
const model = defineModel<number>({ default: 0 })
const shown = computed({
  get: () => (currency.value === 'KHR' ? model.value : model.value / 100),
  set: (v: number | null) => (model.value = v == null ? 0 : currency.value === 'KHR' ? Math.round(v) : Math.round(v * 100)),
})
</script>

<template>
  <InputNumber
    v-model="shown"
    @input="(e: { value: unknown }) => (shown = typeof e.value === 'number' ? e.value : null)"
    :input-id="inputId"
    :min="0"
    :min-fraction-digits="currency === 'USD' ? 2 : 0"
    :max-fraction-digits="currency === 'USD' ? 2 : 0"
    :prefix="currency === 'USD' ? '$ ' : undefined"
    :suffix="currency === 'KHR' ? ' ៛' : undefined"
    :placeholder="placeholder"
    class="w-full"
    input-class="w-full"
    inputmode="decimal"
  />
</template>
