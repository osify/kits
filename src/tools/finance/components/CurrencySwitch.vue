<script setup lang="ts">
import SelectButton from 'primevue/selectbutton'
import { currency } from '../state'

const options = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
</script>

<template>
  <SelectButton v-model="currency" :options="options" option-label="label" option-value="value" :allow-empty="false" size="small" />
</template>
