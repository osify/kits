<script setup lang="ts">
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import type { Currency } from '@/core/util/money'

/** Amount bound to minor units of `currency` (riel, or USD cents). */
const props = defineProps<{ currency: Currency; inputId?: string; autofocus?: boolean; allowNegative?: boolean }>()
const model = defineModel<number>({ default: 0 })
const shown = computed({
  get: () => (props.currency === 'KHR' ? model.value : model.value / 100),
  set: (v: number | null) => (model.value = v == null ? 0 : props.currency === 'KHR' ? Math.round(v) : Math.round(v * 100)),
})
</script>

<template>
  <InputNumber
    v-model="shown"
    @input="(e: { value: unknown }) => (shown = typeof e.value === 'number' ? e.value : null)"
    :input-id="inputId"
    :min="allowNegative ? undefined : 0"
    :min-fraction-digits="currency === 'USD' ? 2 : 0"
    :max-fraction-digits="currency === 'USD' ? 2 : 0"
    :prefix="currency === 'USD' ? '$ ' : undefined"
    :suffix="currency === 'KHR' ? ' ៛' : undefined"
    :pt="autofocus ? { pcInputText: { root: { autofocus: true } } } : undefined"
    class="w-full"
    input-class="w-full text-lg"
    inputmode="decimal"
  />
</template>
