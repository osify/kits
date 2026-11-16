<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import ShopForm from '../components/ShopForm.vue'
import TemplatePicker from '../components/TemplatePicker.vue'
import RestorePanel from '../components/RestorePanel.vue'
import { useCatalogStore } from '../stores/catalog'
import { useShopStore } from '../stores/shop'

/** First run: shop → starting menu → backup. Or restore an existing backup. */
const { t } = useI18n()
const router = useRouter()
const shop = useShopStore()
const cat = useCatalogStore()
const step = ref('1')
const restoring = ref(false)

async function afterTemplate() {
  await cat.load()
  step.value = '3'
}
async function afterRestore() {
  // Reload so every screen reads the restored database.
  history.replaceState(null, '', '/pos/#/')
  location.reload()
}
function finish() {
  router.replace('/sell')
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('pos.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('pos.tagline') }}</p>
    </div>

    <template v-if="!restoring">
      <Stepper v-model:value="step" linear>
        <StepList>
          <Step value="1">{{ t('pos.welcome.step1') }}</Step>
          <Step value="2">{{ t('pos.welcome.step2') }}</Step>
          <Step value="3">{{ t('pos.welcome.step3') }}</Step>
        </StepList>
        <StepPanels>
          <StepPanel value="1">
            <ShopForm compact :submit-label="t('pos.c.next')" @saved="step = '2'" />
          </StepPanel>
          <StepPanel value="2">
            <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.setup.templatesHint') }}</p>
            <TemplatePicker @applied="afterTemplate" />
            <div class="mt-4 flex gap-2">
              <Button :label="t('pos.c.back')" text icon="pi pi-arrow-left" @click="step = '1'" />
              <Button :label="t('pos.welcome.startEmpty')" outlined @click="step = '3'" />
            </div>
          </StepPanel>
          <StepPanel value="3">
            <div class="flex flex-col gap-3">
              <p>{{ t('pos.welcome.backupBody') }}</p>
              <ul class="list-inside list-disc text-sm text-[var(--k-muted)]">
                <li>{{ t('pos.welcome.tip1') }}</li>
                <li>{{ t('pos.welcome.tip2') }}</li>
                <li>{{ t('pos.welcome.tip3') }}</li>
              </ul>
              <div class="flex flex-wrap gap-2">
                <Button :label="t('pos.welcome.finish')" icon="pi pi-shopping-cart" @click="finish" />
                <Button :label="t('pos.welcome.setupBackup')" icon="pi pi-cloud-upload" outlined @click="router.replace('/backup')" />
              </div>
            </div>
          </StepPanel>
        </StepPanels>
      </Stepper>
      <div v-if="!shop.shop" class="rounded-xl border border-dashed border-[var(--k-border)] p-4 text-sm">
        <span>{{ t('pos.welcome.restoreQ') }}</span>
        <Button :label="t('pos.welcome.restoreA')" link @click="restoring = true" />
      </div>
    </template>

    <section v-else class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <h2 class="mb-3 font-semibold">{{ t('pos.bk.restoreTitle') }}</h2>
      <RestorePanel @restored="afterRestore" />
      <Button class="mt-3" :label="t('pos.c.back')" text icon="pi pi-arrow-left" @click="restoring = false" />
    </section>
  </div>
</template>
