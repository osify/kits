<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import ItemThumb from './ItemThumb.vue'
import { useCatalogStore, localName } from '../stores/catalog'
import { useShopStore } from '../stores/shop'
import type { Item } from '../db/catalog'

/** Tap-to-sell product grid with category chips, search and barcode-scanner input. */
const props = defineProps<{ counts?: Record<string, number>; stock?: Record<string, number> }>()
const emit = defineEmits<{ pick: [item: Item] }>()

const { t, locale } = useI18n()
const cat = useCatalogStore()
const shop = useShopStore()
const selected = ref<string | null>(null)
const search = ref('')

const usedCategories = computed(() => {
  const used = new Set(cat.activeItems.map((i) => i.category_id))
  return cat.activeCategories.filter((c) => used.has(c.id))
})

const visible = computed(() => {
  let list = cat.activeItems
  if (selected.value) list = list.filter((i) => i.category_id === selected.value)
  const q = search.value.trim().toLowerCase()
  if (q)
    list = list.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.name_km ?? '').includes(q) || (i.sku ?? '').toLowerCase() === q || (i.barcode ?? '') === q,
    )
  return list
})

const catCount = (id: string) =>
  props.counts ? cat.activeItems.filter((i) => i.category_id === id).reduce((s, i) => s + (props.counts![i.id] ?? 0), 0) : 0
const allCount = computed(() => (props.counts ? Object.values(props.counts).reduce((a, b) => a + b, 0) : 0))

/** USB/Bluetooth barcode scanners type the code + Enter. */
function onEnter() {
  const q = search.value.trim()
  if (!q) return
  const hit = cat.activeItems.find((i) => i.barcode === q || i.sku === q) ?? (visible.value.length === 1 ? visible.value[0] : null)
  if (hit) {
    emit('pick', hit)
    search.value = ''
  }
}

const color = (i: Item) => (i.category_id ? cat.categoryById.get(i.category_id)?.color : null) ?? '#059669'
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <IconField>
      <InputIcon class="pi pi-search" />
      <InputText v-model="search" :placeholder="t('pos.sell.searchPh')" class="w-full" enterkeyhint="search" @keydown.enter.prevent="onEnter" />
    </IconField>

    <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
      <button
        type="button"
        class="chip"
        :class="{ 'chip-on': selected === null }"
        :aria-pressed="selected === null"
        @click="selected = null"
      >
        {{ t('pos.c.all') }}
        <span v-if="allCount" class="chip-badge">{{ allCount }}</span>
      </button>
      <button
        v-for="c in usedCategories"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ 'chip-on': selected === c.id }"
        :style="{ '--cat': c.color || '#059669' }"
        :aria-pressed="selected === c.id"
        @click="selected = c.id"
      >
        <span v-if="c.icon" aria-hidden="true">{{ c.icon }}</span>
        {{ localName(c, locale) }}
        <span v-if="catCount(c.id)" class="chip-badge">{{ catCount(c.id) }}</span>
      </button>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
      <button
        v-for="i in visible"
        :key="i.id"
        type="button"
        class="tile"
        :style="{ '--cat': color(i) }"
        @click="emit('pick', i)"
      >
        <ItemThumb :path="i.image_path" :icon="i.icon" :name="i.name" :color="color(i)" />
        <span class="line-clamp-2 text-center text-sm leading-snug">{{ localName(i, locale) }}</span>
        <span class="text-xs font-semibold text-[var(--k-muted)]">{{ shop.fmt(i.price) }}</span>
        <span v-if="counts?.[i.id]" class="tile-badge">{{ counts[i.id] }}</span>
        <span
          v-if="stock && i.id in stock"
          class="tile-stock"
          :class="{ out: stock[i.id] <= 0, low: stock[i.id] > 0 && i.low_stock != null && stock[i.id] <= i.low_stock }"
        >
          {{ stock[i.id] <= 0 ? t('pos.stock.out') : t('pos.stock.left', { n: stock[i.id] }) }}
        </span>
      </button>
      <p v-if="!visible.length" class="col-span-full py-10 text-center text-[var(--k-muted)]">{{ t('pos.sell.noItems') }}</p>
    </div>
  </div>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  border: 1px solid var(--cat, var(--k-border));
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: 0.875rem;
  background: var(--k-surface);
}
.chip-on {
  background: var(--cat, #059669);
  border-color: var(--cat, #059669);
  color: #fff;
}
.chip-badge {
  min-width: 1.25rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.75);
  color: #fff;
  font-size: 0.7rem;
  padding: 0 0.35rem;
  text-align: center;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--k-border);
  border-top: 3px solid var(--cat);
  border-radius: 0.75rem;
  background: var(--k-surface);
  padding: 0.6rem 0.4rem;
  transition: transform 0.05s;
  touch-action: manipulation;
}
.tile:active {
  transform: scale(0.97);
}
.tile-stock {
  font-size: 0.7rem;
  color: var(--k-muted);
}
.tile-stock.low {
  color: #b45309;
  font-weight: 600;
}
.tile-stock.out {
  color: #dc2626;
  font-weight: 600;
}
.tile-badge {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  min-width: 1.5rem;
  border-radius: 999px;
  background: #059669;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.05rem 0.4rem;
}
</style>
