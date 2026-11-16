<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { getSetting, setSetting } from '../db'
import { requestPersist } from '@/core/util/storage'

const { t } = useI18n()
const visible = ref(false)

onMounted(async () => {
  visible.value = !(await getSetting('disclaimer_accepted_at'))
})

async function accept() {
  // Stored in the database: a restored backup keeps the acceptance.
  await setSetting('disclaimer_accepted_at', String(Date.now()))
  visible.value = false
  // Accepting is a user gesture: a good moment to ask for persistent storage.
  await requestPersist()
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :closable="false" :header="t('pos.disclaimer.title')" class="w-[min(36rem,calc(100vw-2rem))]">
    <div class="flex flex-col gap-3 text-sm">
      <p>{{ t('pos.disclaimer.p1') }}</p>
      <p>{{ t('pos.disclaimer.p2') }}</p>
      <p class="text-[var(--k-muted)]">{{ t('pos.disclaimer.p3') }}</p>
    </div>
    <template #footer>
      <Button :label="t('pos.disclaimer.accept')" icon="pi pi-check" @click="accept" />
    </template>
  </Dialog>
</template>
