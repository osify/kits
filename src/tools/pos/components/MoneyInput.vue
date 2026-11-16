<script setup lang="ts">
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import { useShopStore } from '../stores/shop'
import type { Currency } from '@/core/util/money'

/** Money field bound to INTEGER minor units (riel, or USD cents). */
const props = defineProps<{ currency?: Currency; placeholder?: string; autofocus?: boolean; inputId?: string }>()
const model = defineModel<number | null>({ default: 0 })
const shop = useShopStore()
const cur = computed(() => props.currency ?? shop.base)

const shown = computed({
  get: () => (model.value == null ? null : shop.toInput(model.value, cur.value)),
  set: (v: number | null) => (model.value = v == null ? null : shop.parseInput(v, cur.value)),
})
</script>

<template>
  <InputNumber
    v-model="shown"
    @input="(e: { value: unknown }) => (shown = typeof e.value === 'number' ? e.value : null)"
    :input-id="inputId"
    :min="0"
    :min-fraction-digits="cur === 'USD' ? 2 : 0"
    :max-fraction-digits="cur === 'USD' ? 2 : 0"
    :prefix="cur === 'USD' ? '$ ' : undefined"
    :suffix="cur === 'KHR' ? ' ៛' : undefined"
    :placeholder="placeholder"
    :autofocus="autofocus"
    input-class="w-full"
    class="w-full"
    inputmode="decimal"
  />
</template>
