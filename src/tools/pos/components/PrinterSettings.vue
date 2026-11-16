<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { printer, setPrinterMode, setBaud, supportFor, printBlocks, testBlocks, disconnectPrinter, type PrinterMode } from '../print'
import { useShopStore } from '../stores/shop'
import { hasFeature } from '@/core/license'

const { t } = useI18n()
const toast = useToast()
const shop = useShopStore()
const allowed = computed(() => hasFeature('directPrint'))

const modes = computed(() =>
  (['system', 'bluetooth', 'serial'] as PrinterMode[]).map((m) => ({
    value: m,
    label: t(`pos.printer.mode.${m}`),
    disabled: m !== 'system' && (!supportFor(m) || !allowed.value),
  })),
)
const bauds = [9600, 19200, 38400, 57600, 115200].map((b) => ({ label: String(b), value: b }))

async function test() {
  try {
    await printBlocks(testBlocks(shop.shop?.name ?? '', shop.shop?.paper_mm ?? 80), shop.shop?.paper_mm ?? 80)
    toast.add({ severity: 'success', summary: t('pos.printer.sent'), life: 2000 })
  } catch (e: any) {
    if (e?.name !== 'NotFoundError') toast.add({ severity: 'error', summary: t('pos.printer.failed'), detail: e.message, life: 6000 })
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-[var(--k-muted)]">{{ t('pos.printer.intro') }}</p>
    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('pos.printer.how') }}</span>
      <Select
        :model-value="printer.mode"
        :options="modes"
        option-label="label"
        option-value="value"
        option-disabled="disabled"
        @update:model-value="(m: PrinterMode) => setPrinterMode(m)"
      />
    </label>
    <Message v-if="!supportFor('bluetooth') && !supportFor('serial')" severity="secondary" :closable="false">{{ t('pos.printer.unsupported') }}</Message>
    <Message v-if="printer.mode === 'system'" severity="secondary" :closable="false">{{ t('pos.printer.systemHint') }}</Message>
    <template v-else>
      <Message severity="info" :closable="false">{{ printer.mode === 'bluetooth' ? t('pos.printer.btHint') : t('pos.printer.serialHint') }}</Message>
      <label v-if="printer.mode === 'serial'" class="flex flex-col gap-1 text-sm">
        <span>{{ t('pos.printer.baud') }}</span>
        <Select :model-value="printer.baud" :options="bauds" option-label="label" option-value="value" @update:model-value="(b: number) => setBaud(b)" />
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('pos.printer.test')" icon="pi pi-print" :loading="printer.busy" @click="test" />
        <Tag v-if="printer.connected" severity="success" :value="printer.connected" />
        <Button v-if="printer.connected" :label="t('pos.bk.disconnect')" text size="small" @click="disconnectPrinter" />
      </div>
      <p class="text-xs text-[var(--k-muted)]">{{ t('pos.printer.paperNote', { mm: shop.shop?.paper_mm ?? 80 }) }}</p>
    </template>
  </div>
</template>
