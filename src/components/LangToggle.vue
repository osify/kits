<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { setLang, type Lang } from '@/core/i18n'

const { t, locale } = useI18n()

function toggle() {
  setLang((locale.value === 'km' ? 'en' : 'km') as Lang)
}
</script>

<template>
  <Button size="small" text icon="pi pi-language" :label="t('common.language')" @click="toggle" />
</template>
