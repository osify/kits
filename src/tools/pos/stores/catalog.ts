import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { itemModifierMap, listCategories, listItems, listModifierGroups, type Category, type Item, type ModifierGroup } from '../db/catalog'

/** In-memory copy of the menu for fast selling screens. Reload after edits. */
export const useCatalogStore = defineStore('catalog', () => {
  const categories = ref<Category[]>([])
  const items = ref<Item[]>([])
  const groups = ref<ModifierGroup[]>([])
  const itemGroups = ref<Map<string, string[]>>(new Map())
  const loaded = ref(false)

  async function load() {
    const [c, i, g, m] = await Promise.all([listCategories(true), listItems(true), listModifierGroups(), itemModifierMap()])
    categories.value = c
    items.value = i
    groups.value = g
    itemGroups.value = m
    loaded.value = true
  }

  const activeCategories = computed(() => categories.value.filter((c) => c.active))
  const activeItems = computed(() => items.value.filter((i) => i.active))
  const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const itemById = computed(() => new Map(items.value.map((i) => [i.id, i])))

  function groupsFor(itemId: string): ModifierGroup[] {
    const ids = itemGroups.value.get(itemId) ?? []
    return ids.map((id) => groups.value.find((g) => g.id === id)).filter(Boolean) as ModifierGroup[]
  }

  return { categories, items, groups, itemGroups, loaded, load, activeCategories, activeItems, categoryById, itemById, groupsFor }
})

/** Show Khmer or English name depending on the UI language (falls back to the other). */
export function localName(o: { name: string; name_km?: string | null }, lang: string): string {
  return lang === 'km' ? o.name_km || o.name : o.name || o.name_km || ''
}
