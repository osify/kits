<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import type { Item, ModifierGroup } from '../db/catalog'
import type { LineModifier } from '../db/sales'
import { localName } from '../stores/catalog'
import { useShopStore } from '../stores/shop'

/** Pick add-ons (size, sugar, ice…) for an item. */
const props = defineProps<{ item: Item | null; groups: ModifierGroup[]; initial?: LineModifier[] }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ confirm: [mods: LineModifier[]] }>()

const { t, locale } = useI18n()
const shop = useShopStore()
const picked = ref<Record<string, string[]>>({})

watch(visible, (v) => {
  if (!v) return
  const init: Record<string, string[]> = {}
  for (const m of props.initial ?? []) init[m.group_id] = [...(init[m.group_id] ?? []), m.option_id]
  picked.value = init
})

function toggle(g: ModifierGroup, optionId: string) {
  const cur = picked.value[g.id] ?? []
  if (cur.includes(optionId)) picked.value[g.id] = cur.filter((x) => x !== optionId)
  else if (g.max_select <= 1) picked.value[g.id] = [optionId]
  else if (cur.length < g.max_select) picked.value[g.id] = [...cur, optionId]
}

const missing = computed(() => props.groups.filter((g) => (picked.value[g.id]?.length ?? 0) < g.min_select))
const extra = computed(() =>
  props.groups.reduce((s, g) => s + g.options.filter((o) => picked.value[g.id]?.includes(o.id)).reduce((a, o) => a + o.price_delta, 0), 0),
)

function confirm() {
  const mods: LineModifier[] = []
  for (const g of props.groups)
    for (const o of g.options)
      if (picked.value[g.id]?.includes(o.id))
        mods.push({ group_id: g.id, group_name: localName(g, locale.value), option_id: o.id, name: o.name, name_km: o.name_km, price_delta: o.price_delta })
  emit('confirm', mods)
  visible.value = false
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="item ? localName(item, locale) : ''" class="w-[min(32rem,calc(100vw-1.5rem))]">
    <div class="flex flex-col gap-4">
      <section v-for="g in groups" :key="g.id">
        <div class="mb-2 flex items-baseline gap-2">
          <h3 class="font-semibold">{{ localName(g, locale) }}</h3>
          <span class="text-xs text-[var(--k-muted)]">
            <template v-if="g.min_select">{{ t('pos.sell.required', { n: g.min_select }) }} · </template>
            {{ g.max_select > 1 ? t('pos.sell.upTo', { n: g.max_select }) : t('pos.sell.chooseOne') }}
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="o in g.options"
            :key="o.id"
            type="button"
            class="rounded-lg border px-3 py-2 text-sm"
            :class="
              picked[g.id]?.includes(o.id)
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-[var(--k-border)] bg-[var(--k-surface)]'
            "
            :aria-pressed="picked[g.id]?.includes(o.id) ?? false"
            @click="toggle(g, o.id)"
          >
            {{ localName(o, locale) }}
            <span v-if="o.price_delta" class="opacity-80">+{{ shop.fmt(o.price_delta) }}</span>
          </button>
        </div>
      </section>
    </div>
    <template #footer>
      <span class="mr-auto self-center text-sm text-[var(--k-muted)]">{{ item ? shop.fmt(item.price + extra) : '' }}</span>
      <Button :label="t('pos.c.cancel')" text @click="visible = false" />
      <Button :label="t('pos.sell.addToCart')" icon="pi pi-check" :disabled="missing.length > 0" @click="confirm" />
    </template>
  </Dialog>
</template>
