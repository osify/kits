<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ItemThumb from '../components/ItemThumb.vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useCatalogStore, localName } from '../stores/catalog'
import { addMove, stockList, stockMoves, type MoveKind, type StockMove, type StockRow } from '../db/stock'
import { saveItem } from '../db/catalog'
import { hasFeature } from '@/core/license'

/** Simple stock: receive, count, waste. Sales reduce stock automatically; voids put it back. */
const { t, locale } = useI18n()
const toast = useToast()
const cat = useCatalogStore()
const rows = ref<StockRow[]>([])
const filter = ref('')
const allowed = computed(() => hasFeature('stock'))

async function load() {
  rows.value = await stockList()
}
onMounted(async () => {
  if (!cat.loaded) await cat.load()
  await load()
})

watch(dataVersion, load)

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return rows.value.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.name_km ?? '').includes(q))
})
const low = (r: StockRow) => r.on_hand <= 0 || (r.low_stock != null && r.on_hand <= r.low_stock)
const lowCount = computed(() => rows.value.filter(low).length)
const color = (r: StockRow) => (r.category_id ? cat.categoryById.get(r.category_id)?.color : null)

// ── move dialog ──
const moveOpen = ref(false)
const moveRow = ref<StockRow | null>(null)
const kind = ref<MoveKind>('RECEIVE')
const qty = ref<number | null>(null)
const cost = ref<number | null>(null)
const note = ref('')
const history = ref<StockMove[]>([])
const kinds = computed(() => [
  { label: t('pos.stock.receive'), value: 'RECEIVE' },
  { label: t('pos.stock.count'), value: 'ADJUST' },
  { label: t('pos.stock.waste'), value: 'WASTE' },
])
async function openMove(r: StockRow, k: MoveKind = 'RECEIVE') {
  moveRow.value = r
  kind.value = k
  qty.value = k === 'ADJUST' ? r.on_hand : null
  cost.value = null
  note.value = ''
  history.value = await stockMoves(r.item_id, 20)
  moveOpen.value = true
}
async function saveMove() {
  if (!moveRow.value || qty.value == null) return
  await addMove(moveRow.value.item_id, kind.value, qty.value, { unitCost: cost.value, note: note.value })
  moveOpen.value = false
  await load()
  toast.add({ severity: 'success', summary: t('pos.c.saved'), life: 1500 })
}

// ── choose tracked items ──
const pickOpen = ref(false)
const untracked = computed(() => cat.items.filter((i) => i.active && !i.track_stock))
async function track(itemId: string) {
  const it = cat.itemById.get(itemId)
  if (!it) return
  await saveItem({ ...it, track_stock: 1 })
  await cat.load()
  await load()
}
async function untrack(r: StockRow) {
  const it = cat.itemById.get(r.item_id)
  if (!it) return
  await saveItem({ ...it, track_stock: 0 })
  await cat.load()
  await load()
}
const kindLabel = (k: string) => ({ RECEIVE: t('pos.stock.receive'), ADJUST: t('pos.stock.count'), WASTE: t('pos.stock.waste') })[k] ?? k
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">{{ t('pos.nav.stock') }}</h1>
      <Button :label="t('pos.stock.trackItems')" icon="pi pi-plus" size="small" :disabled="!allowed" @click="pickOpen = true" />
    </div>
    <p class="text-sm text-[var(--k-muted)]">{{ t('pos.stock.intro') }}</p>
    <Message v-if="!allowed" severity="info" :closable="false">{{ t('pos.plan.needs') }}</Message>
    <Message v-if="lowCount" severity="warn" :closable="false">{{ t('pos.stock.lowCount', { n: lowCount }) }}</Message>

    <InputText v-if="rows.length > 8" v-model="filter" :placeholder="t('pos.c.search')" />
    <p v-if="!rows.length" class="py-8 text-center text-[var(--k-muted)]">{{ t('pos.stock.empty') }}</p>
    <ul v-else class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="r in shown" :key="r.item_id" class="flex items-center gap-3 px-3 py-2">
        <ItemThumb :path="r.image_path" :icon="r.icon" :name="r.name" :color="color(r)" size="sm" />
        <button type="button" class="min-w-0 flex-1 text-left" @click="openMove(r)">
          <span class="block truncate font-medium">{{ localName(r, locale) }}</span>
          <span class="text-xs text-[var(--k-muted)]">{{ t('pos.stock.soldTotal', { n: r.sold }) }}<template v-if="r.low_stock != null"> · {{ t('pos.stock.alertAt', { n: r.low_stock }) }}</template></span>
        </button>
        <Tag v-if="r.on_hand <= 0" severity="danger" :value="t('pos.stock.out')" />
        <Tag v-else-if="low(r)" severity="warn" :value="t('pos.stock.low')" />
        <span class="w-16 text-right text-lg font-semibold tabular-nums" :class="{ 'text-red-600': r.on_hand <= 0 }">{{ r.on_hand }}</span>
        <Button icon="pi pi-plus" text rounded size="small" :aria-label="t('pos.stock.receive')" @click="openMove(r, 'RECEIVE')" />
        <Button icon="pi pi-pencil" text rounded size="small" :aria-label="t('pos.stock.count')" @click="openMove(r, 'ADJUST')" />
      </li>
    </ul>

    <Dialog v-model:visible="moveOpen" modal :header="moveRow ? localName(moveRow, locale) : ''" class="w-[min(30rem,calc(100vw-1.5rem))]">
      <div v-if="moveRow" class="flex flex-col gap-3">
        <div class="text-sm text-[var(--k-muted)]">{{ t('pos.stock.onHand') }}: <b class="text-[var(--k-text)]">{{ moveRow.on_hand }}</b></div>
        <SelectButton v-model="kind" :options="kinds" option-label="label" option-value="value" :allow-empty="false" />
        <label class="flex flex-col gap-1 text-sm">
          <span>{{ kind === 'ADJUST' ? t('pos.stock.countedQty') : t('pos.c.qty') }}</span>
          <InputNumber v-model="qty" :min="kind === 'ADJUST' ? undefined : 0" :max-fraction-digits="2" show-buttons autofocus />
        </label>
        <label v-if="kind === 'RECEIVE'" class="flex flex-col gap-1 text-sm">
          <span>{{ t('pos.stock.unitCost') }} <small class="text-[var(--k-muted)]">({{ t('pos.c.optional') }})</small></span>
          <MoneyInput v-model="cost" />
        </label>
        <label class="flex flex-col gap-1 text-sm"><span>{{ t('pos.c.note') }}</span><InputText v-model="note" /></label>
        <details v-if="history.length" class="text-sm">
          <summary class="cursor-pointer text-[var(--k-muted)]">{{ t('pos.stock.history') }}</summary>
          <ul class="mt-1 max-h-48 overflow-y-auto">
            <li v-for="h in history" :key="h.id" class="flex justify-between gap-2 border-t border-[var(--k-border)] py-1">
              <span>{{ h.business_date }} · {{ kindLabel(h.kind) }}<template v-if="h.note"> · {{ h.note }}</template></span>
              <span class="tabular-nums" :class="h.qty < 0 ? 'text-red-600' : 'text-primary-600'">{{ h.qty > 0 ? '+' : '' }}{{ h.qty }}</span>
            </li>
          </ul>
        </details>
      </div>
      <template #footer>
        <Button :label="t('pos.stock.untrack')" text severity="secondary" class="mr-auto" @click="moveRow && untrack(moveRow).then(() => (moveOpen = false))" />
        <Button :label="t('pos.c.cancel')" text @click="moveOpen = false" />
        <Button :label="t('pos.c.save')" icon="pi pi-check" :disabled="qty == null" @click="saveMove" />
      </template>
    </Dialog>

    <Dialog v-model:visible="pickOpen" modal :header="t('pos.stock.trackItems')" class="w-[min(30rem,calc(100vw-1.5rem))]">
      <p class="mb-2 text-sm text-[var(--k-muted)]">{{ t('pos.stock.trackHint') }}</p>
      <ul class="max-h-96 divide-y divide-[var(--k-border)] overflow-y-auto">
        <li v-for="i in untracked" :key="i.id" class="flex items-center gap-2 py-1.5">
          <ItemThumb :path="i.image_path" :icon="i.icon" :name="i.name" size="sm" />
          <span class="flex-1">{{ localName(i, locale) }}</span>
          <Button :label="t('pos.stock.track')" size="small" outlined @click="track(i.id)" />
        </li>
      </ul>
      <p v-if="!untracked.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.stock.allTracked') }}</p>
    </Dialog>
  </div>
</template>
