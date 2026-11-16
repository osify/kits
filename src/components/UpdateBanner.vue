<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { updateReady, applyUpdate } from '@/core/pwa/update'

const { t } = useI18n()
const dismiss = () => (updateReady.value = false)
</script>

<template>
  <div v-if="updateReady" class="flex flex-wrap items-center justify-center gap-2 bg-primary-600 px-4 py-2 text-sm text-white">
    <i class="pi pi-sparkles" />
    <span>{{ t('common.update.ready') }}</span>
    <Button size="small" severity="contrast" :label="t('common.update.action')" @click="applyUpdate" />
    <Button size="small" text class="!text-white" :label="t('common.update.later')" @click="dismiss" />
  </div>
</template>
