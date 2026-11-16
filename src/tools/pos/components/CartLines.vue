<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { parseMods, type SaleLine } from '../db/sales'
import { useCatalogStore, localName } from '../stores/catalog'
import { useShopStore } from '../stores/shop'

/** Lines of a cart / tally with − qty + controls. */
defineProps<{ lines: SaleLine[]; readonly?: boolean; allowInternal?: boolean }>()
const emit = defineEmits<{ qty: [line: SaleLine, qty: number]; edit: [line: SaleLine]; internal: [line: SaleLine, on: boolean] }>()
const { t, locale } = useI18n()
const shop = useShopStore()
const cat = useCatalogStore()

const canEdit = (l: SaleLine) => !!l.item_id && cat.groupsFor(l.item_id).length > 0
const lineName = (l: SaleLine) => {
  const it = l.item_id ? cat.itemById.get(l.item_id) : null
  return it ? localName(it, locale.value) : l.name
}
</script>

<template>
  <ul class="divide-y divide-[var(--k-border)]">
    <li v-for="l in lines" :key="l.id" class="flex items-center gap-2 py-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1">
          <span class="truncate font-medium">{{ lineName(l) }}</span>
          <span v-if="l.internal" class="rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">{{ t('pos.quick.free') }}</span>
        </div>
        <div v-if="l.modifiers" class="flex flex-wrap gap-1">
          <span v-for="m in parseMods(l.modifiers)" :key="m.option_id" class="rounded bg-[var(--k-border)]/60 px-1.5 text-xs">
            {{ locale === 'km' ? m.name_km || m.name : m.name }}
          </span>
        </div>
        <div class="text-xs text-[var(--k-muted)]">
          {{ shop.fmt(l.unit_price) }} × {{ l.qty }}
          <template v-if="!l.internal"> = {{ shop.fmt(l.line_total) }}</template>
        </div>
      </div>
      <template v-if="!readonly">
        <Button v-if="canEdit(l)" icon="pi pi-pencil" text rounded size="small" :aria-label="t('pos.sell.addons')" @click="emit('edit', l)" />
        <Button
          v-if="allowInternal"
          icon="pi pi-gift"
          text
          rounded
          size="small"
          :severity="l.internal ? 'warn' : 'secondary'"
          :aria-label="t('pos.quick.free')"
          :aria-pressed="!!l.internal"
          @click="emit('internal', l, !l.internal)"
        />
        <Button icon="pi pi-minus" text rounded size="small" :aria-label="t('pos.c.less')" @click="emit('qty', l, l.qty - 1)" />
        <span class="w-7 text-center font-semibold tabular-nums">{{ l.qty }}</span>
        <Button icon="pi pi-plus" text rounded size="small" :aria-label="t('pos.c.more')" @click="emit('qty', l, l.qty + 1)" />
      </template>
      <span v-else class="font-semibold tabular-nums">× {{ l.qty }}</span>
    </li>
  </ul>
</template>
