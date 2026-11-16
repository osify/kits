<script setup lang="ts">
import TrustedClinics from '../components/TrustedClinics.vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import ShopForm from '../components/ShopForm.vue'
import PrinterSettings from '../components/PrinterSettings.vue'
import PlanSettings from '../components/PlanSettings.vue'
import ItemLimitBar from '../components/ItemLimitBar.vue'
import ItemDialog from '../components/ItemDialog.vue'
import CategoryDialog from '../components/CategoryDialog.vue'
import AddonGroupDialog from '../components/AddonGroupDialog.vue'
import TemplatePicker from '../components/TemplatePicker.vue'
import ItemThumb from '../components/ItemThumb.vue'
import { useCatalogStore, localName } from '../stores/catalog'
import { useShopStore } from '../stores/shop'
import { deleteCategory, deleteItem, deleteModifierGroup, saveCategory, type Category, type Item, type ModifierGroup } from '../db/catalog'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const cat = useCatalogStore()
const shop = useShopStore()

const tab = computed({
  get: () => (route.query.tab as string) || 'items',
  set: (v) => router.replace({ query: { tab: v } }),
})

onMounted(() => cat.load())

// items
const itemOpen = ref(false)
const editingItem = ref<Item | null>(null)
const filter = ref('')
const itemsShown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return cat.items.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.name_km ?? '').includes(q))
})
function openItem(i: Item | null) {
  editingItem.value = i
  itemOpen.value = true
}
function removeItem(i: Item) {
  confirm.require({
    header: t('pos.c.delete'),
    message: t('pos.setup.deleteItemConfirm', { name: localName(i, locale.value) }),
    icon: 'pi pi-trash',
    acceptProps: { label: t('pos.c.delete'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await deleteItem(i.id)
      await cat.load()
    },
  })
}

// categories
const catOpen = ref(false)
const editingCat = ref<Category | null>(null)
function openCat(c: Category | null) {
  editingCat.value = c
  catOpen.value = true
}
const itemsIn = (id: string) => cat.items.filter((i) => i.category_id === id).length
function removeCat(c: Category) {
  confirm.require({
    header: t('pos.c.delete'),
    message: t('pos.setup.deleteCategoryConfirm', { name: localName(c, locale.value) }),
    icon: 'pi pi-trash',
    acceptProps: { label: t('pos.c.delete'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await deleteCategory(c.id)
      await cat.load()
    },
  })
}
async function moveCat(c: Category, dir: -1 | 1) {
  const list = [...cat.categories]
  const i = list.findIndex((x) => x.id === c.id)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  for (const [k, x] of list.entries()) if (x.sort !== k + 1) await saveCategory({ ...x, sort: k + 1 })
  await cat.load()
}

// add-ons
const addonOpen = ref(false)
const editingGroup = ref<ModifierGroup | null>(null)
function openGroup(g: ModifierGroup | null) {
  editingGroup.value = g
  addonOpen.value = true
}
function removeGroup(g: ModifierGroup) {
  confirm.require({
    header: t('pos.c.delete'),
    message: t('pos.setup.deleteAddonConfirm', { name: localName(g, locale.value) }),
    icon: 'pi pi-trash',
    acceptProps: { label: t('pos.c.delete'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await deleteModifierGroup(g.id)
      await cat.load()
    },
  })
}

async function onTemplate() {
  await cat.load()
  toast.add({ severity: 'success', summary: t('pos.setup.templateAdded'), life: 3000 })
  tab.value = 'items'
}
const catColor = (i: Item) => (i.category_id ? cat.categoryById.get(i.category_id)?.color : null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('pos.nav.setup') }}</h1>
    <Tabs v-model:value="tab" scrollable>
      <TabList>
        <Tab value="items"><i class="pi pi-box mr-2" />{{ t('pos.setup.tabItems') }}</Tab>
        <Tab value="categories"><i class="pi pi-tags mr-2" />{{ t('pos.setup.tabCategories') }}</Tab>
        <Tab value="addons"><i class="pi pi-sliders-h mr-2" />{{ t('pos.setup.tabAddons') }}</Tab>
        <Tab value="templates"><i class="pi pi-th-large mr-2" />{{ t('pos.setup.tabTemplates') }}</Tab>
        <Tab value="shop"><i class="pi pi-shop mr-2" />{{ t('pos.setup.tabShop') }}</Tab>
        <Tab value="printer"><i class="pi pi-print mr-2" />{{ t('pos.setup.tabPrinter') }}</Tab>
        <Tab value="plan"><i class="pi pi-verified mr-2" />{{ t('pos.setup.tabPlan') }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="items">
          <ItemLimitBar @upgrade="tab = 'plan'" />
          <div class="mb-3 flex flex-wrap gap-2">
            <InputText v-model="filter" :placeholder="t('pos.c.search')" class="min-w-0 flex-1" />
            <Button :label="t('pos.setup.newItem')" icon="pi pi-plus" @click="openItem(null)" />
          </div>
          <p v-if="!cat.items.length" class="py-8 text-center text-[var(--k-muted)]">
            {{ t('pos.setup.noItems') }}
            <Button :label="t('pos.setup.tabTemplates')" link @click="tab = 'templates'" />
          </p>
          <ul v-if="itemsShown.length" class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
            <li v-for="i in itemsShown" :key="i.id" class="flex items-center gap-3 px-3 py-2" :class="{ 'opacity-50': !i.active }">
              <ItemThumb :path="i.image_path" :icon="i.icon" :name="i.name" :color="catColor(i)" size="sm" />
              <button type="button" class="min-w-0 flex-1 text-left" @click="openItem(i)">
                <span class="block truncate font-medium">{{ localName(i, locale) }}</span>
                <span class="block truncate text-xs text-[var(--k-muted)]">
                  {{ i.category_id ? localName(cat.categoryById.get(i.category_id)!, locale) : t('pos.c.none') }}
                  <template v-if="cat.itemGroups.get(i.id)?.length"> · {{ t('pos.setup.hasAddons') }}</template>
                </span>
              </button>
              <Tag v-if="!i.active" severity="secondary" :value="t('pos.setup.hidden')" />
              <span class="font-semibold tabular-nums">{{ shop.fmt(i.price) }}</span>
              <Button icon="pi pi-trash" text rounded severity="danger" size="small" :aria-label="t('pos.c.delete')" @click="removeItem(i)" />
            </li>
          </ul>
        </TabPanel>

        <TabPanel value="categories">
          <div class="mb-3 flex justify-end"><Button :label="t('pos.setup.newCategory')" icon="pi pi-plus" @click="openCat(null)" /></div>
          <ul v-if="cat.categories.length" class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
            <li v-for="(c, idx) in cat.categories" :key="c.id" class="flex items-center gap-3 px-3 py-2">
              <span class="size-4 rounded-full" :style="{ background: c.color || '#059669' }" />
              <span class="text-xl" aria-hidden="true">{{ c.icon }}</span>
              <button type="button" class="min-w-0 flex-1 text-left" @click="openCat(c)">
                <span class="block truncate font-medium">{{ localName(c, locale) }}</span>
                <span class="text-xs text-[var(--k-muted)]">{{ t('pos.setup.itemCount', { n: itemsIn(c.id) }) }}</span>
              </button>
              <Button icon="pi pi-arrow-up" text rounded size="small" :disabled="idx === 0" :aria-label="t('pos.setup.moveUp')" @click="moveCat(c, -1)" />
              <Button icon="pi pi-arrow-down" text rounded size="small" :disabled="idx === cat.categories.length - 1" :aria-label="t('pos.setup.moveDown')" @click="moveCat(c, 1)" />
              <Button icon="pi pi-trash" text rounded severity="danger" size="small" :aria-label="t('pos.c.delete')" @click="removeCat(c)" />
            </li>
          </ul>
        </TabPanel>

        <TabPanel value="addons">
          <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.setup.addonsHint') }}</p>
          <div class="mb-3 flex justify-end"><Button :label="t('pos.setup.newAddon')" icon="pi pi-plus" @click="openGroup(null)" /></div>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="g in cat.groups" :key="g.id" class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-3">
              <div class="mb-2 flex items-center gap-2">
                <button type="button" class="flex-1 text-left font-semibold" @click="openGroup(g)">{{ localName(g, locale) }}</button>
                <Button icon="pi pi-pencil" text rounded size="small" :aria-label="t('pos.c.edit')" @click="openGroup(g)" />
                <Button icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="t('pos.c.delete')" @click="removeGroup(g)" />
              </div>
              <div class="flex flex-wrap gap-1">
                <span v-for="o in g.options" :key="o.id" class="rounded bg-[var(--k-border)]/60 px-2 py-0.5 text-sm">
                  {{ localName(o, locale) }}<template v-if="o.price_delta"> +{{ shop.fmt(o.price_delta) }}</template>
                </span>
              </div>
            </li>
          </ul>
        </TabPanel>

        <TabPanel value="templates">
          <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.setup.templatesHint') }}</p>
          <TemplatePicker @applied="onTemplate" />
        </TabPanel>

        <TabPanel value="shop">
          <div class="max-w-3xl rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] px-5 py-4">
            <ShopForm />
          </div>
          <TrustedClinics class="mt-4" />
        </TabPanel>

        <TabPanel value="printer">
          <div class="max-w-3xl rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] px-5 py-4">
            <PrinterSettings />
          </div>
        </TabPanel>

        <TabPanel value="plan">
          <PlanSettings />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ItemDialog v-model:visible="itemOpen" :item="editingItem" @saved="cat.load()" />
    <CategoryDialog v-model:visible="catOpen" :category="editingCat" @saved="cat.load()" />
    <AddonGroupDialog v-model:visible="addonOpen" :group="editingGroup" @saved="cat.load()" />
  </div>
</template>
