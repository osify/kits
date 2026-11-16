<script setup lang="ts">
import { dataVersion } from '../sync'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ItemGrid from '../components/ItemGrid.vue'
import CartPanel from '../components/CartPanel.vue'
import ModifierDialog from '../components/ModifierDialog.vue'
import PaymentDialog from '../components/PaymentDialog.vue'
import Receipt from '../components/Receipt.vue'
import PrintSheet from '../components/PrintSheet.vue'
import { useCatalogStore } from '../stores/catalog'
import { useShopStore } from '../stores/shop'
import {
  addLine,
  checkout,
  clearLines,
  getPosDraft,
  getSale,
  listParked,
  parkSale,
  parseMods,
  resumeParked,
  setDiscount,
  setLineModifiers,
  setLineQty,
  setNote,
  setSaleCustomer,
  type LineModifier,
  type ParkedRow,
  type PayInput,
  type SaleLine,
  type SaleWithLines,
} from '../db/sales'
import { stockMap } from '../db/stock'
import type { Item } from '../db/catalog'
import { directPrinting, printBlocks, receiptBlocks } from '../print'
import { license } from '@/core/license'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const cat = useCatalogStore()
const shop = useShopStore()

const sale = ref<SaleWithLines | null>(null)
const parked = ref<ParkedRow[]>([])
const stock = ref<Map<string, number>>(new Map())
const cartOpen = ref(false) // phone: cart drawer
const payOpen = ref(false)
const paid = ref<SaleWithLines | null>(null)
const printing = ref(false)

const modOpen = ref(false)
const modItem = ref<Item | null>(null)
const modInitial = ref<LineModifier[]>([])
let modLine: SaleLine | null = null

async function reload() {
  if (!shop.shop) return
  sale.value = sale.value ? await getSale(sale.value.id) : null
  if (!sale.value || sale.value.status !== 'DRAFT' || sale.value.parked_label) sale.value = await getPosDraft(shop.shop)
  parked.value = await listParked()
}
async function reloadStock() {
  stock.value = await stockMap()
}

onMounted(async () => {
  if (!cat.loaded) await cat.load()
  await Promise.all([reload(), reloadStock()])
})

watch(dataVersion, () => Promise.all([reload(), reloadStock()]))

const counts = computed(() => {
  const m: Record<string, number> = {}
  for (const l of sale.value?.lines ?? []) if (l.item_id) m[l.item_id] = (m[l.item_id] ?? 0) + l.qty
  return m
})
/** Stock left after this cart, for tracked items. */
const left = computed(() => {
  const m: Record<string, number> = {}
  for (const [id, n] of stock.value) m[id] = n - (counts.value[id] ?? 0)
  return m
})
const itemCount = computed(() => (sale.value?.lines ?? []).reduce((s, l) => s + l.qty, 0))

async function pick(item: Item) {
  if (!sale.value) return
  if (cat.groupsFor(item.id).length) {
    modItem.value = item
    modInitial.value = []
    modLine = null
    modOpen.value = true
    return
  }
  await addLine(sale.value.id, item)
  await reload()
}
async function onMods(mods: LineModifier[]) {
  if (!sale.value || !modItem.value) return
  if (modLine) await setLineModifiers(modLine.id, modItem.value, mods)
  else await addLine(sale.value.id, modItem.value, mods)
  await reload()
}
function editLine(l: SaleLine) {
  const it = l.item_id ? cat.itemById.get(l.item_id) : null
  if (!it) return
  modItem.value = it
  modInitial.value = parseMods(l.modifiers)
  modLine = l
  modOpen.value = true
}
async function onQty(l: SaleLine, q: number) {
  await setLineQty(l.id, q)
  await reload()
}
async function onDiscount(v: number) {
  if (!sale.value) return
  await setDiscount(sale.value.id, v)
  await reload()
}
async function onNote(v: string) {
  if (sale.value) await setNote(sale.value.id, v)
}
async function onCustomer(id: string | null) {
  if (!sale.value) return
  await setSaleCustomer(sale.value.id, id)
  await reload()
}
function onClear() {
  confirm.require({
    header: t('pos.sell.clear'),
    message: t('pos.sell.clearConfirm'),
    icon: 'pi pi-trash',
    acceptProps: { label: t('pos.sell.clear'), severity: 'danger' },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      if (sale.value) await clearLines(sale.value.id)
      if (sale.value) await setSaleCustomer(sale.value.id, null)
      await reload()
    },
  })
}

// ── park / resume ──
const parkOpen = ref(false)
const parkLabel = ref('')
const parkedOpen = ref(false)
function onPark() {
  parkLabel.value = sale.value?.customer_name || t('pos.park.defaultLabel', { n: parked.value.length + 1 })
  parkOpen.value = true
}
async function doPark() {
  if (!sale.value) return
  await parkSale(sale.value.id, parkLabel.value)
  parkOpen.value = false
  cartOpen.value = false
  sale.value = null
  await reload()
  toast.add({ severity: 'info', summary: t('pos.park.parked'), life: 2000 })
}
async function resume(p: ParkedRow) {
  await resumeParked(p.id, sale.value?.id ?? null, t('pos.park.defaultLabel', { n: parked.value.length }))
  sale.value = await getSale(p.id)
  parkedOpen.value = false
  await reload()
}

// ── pay ──
async function onPay(p: PayInput) {
  if (!sale.value) return
  try {
    paid.value = await checkout(sale.value.id, p)
    payOpen.value = false
    cartOpen.value = false
    sale.value = null
    await Promise.all([reload(), reloadStock()])
  } catch (e: any) {
    const msg = e.message === 'DAY_CLOSED' ? t('pos.sell.dayClosed') : e.message === 'NEED_CUSTOMER' ? t('pos.sell.debtNeedCustomer') : e.message
    toast.add({ severity: 'error', summary: msg, life: 5000 })
  }
}

async function onPrint() {
  if (!paid.value || !shop.shop) return
  if (!directPrinting()) {
    printing.value = true
    return
  }
  try {
    await printBlocks(await receiptBlocks(paid.value, shop.shop, t, license.value?.name), shop.shop.paper_mm)
  } catch (e: any) {
    if (e?.name !== 'NotFoundError') toast.add({ severity: 'error', summary: t('pos.printer.failed'), detail: e.message, life: 5000 })
  }
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1fr_23rem]">
    <ItemGrid :counts="counts" :stock="left" @pick="pick" />

    <aside class="hidden lg:block">
      <div class="sticky top-20 h-[calc(100dvh-7rem)] overflow-hidden rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <CartPanel
          :sale="sale"
          :parked-count="parked.length"
          @qty="onQty"
          @edit="editLine"
          @discount="onDiscount"
          @note="onNote"
          @customer="onCustomer"
          @clear="onClear"
          @park="onPark"
          @parked="parkedOpen = true"
          @charge="payOpen = true"
        />
      </div>
    </aside>

    <div class="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 md:bottom-4 lg:hidden">
      <Button v-if="parked.length" icon="pi pi-inbox" :label="String(parked.length)" severity="secondary" class="shadow-lg" @click="parkedOpen = true" />
      <Button class="flex-1 justify-between shadow-lg" size="large" :disabled="!itemCount" @click="cartOpen = true">
        <span><i class="pi pi-shopping-cart mr-2" />{{ t('pos.sell.cartItems', { n: itemCount }) }}</span>
        <span class="font-bold">{{ shop.fmt(sale?.total ?? 0) }}</span>
      </Button>
    </div>
    <Drawer v-model:visible="cartOpen" position="bottom" class="!h-[88dvh]" :show-close-icon="true">
      <CartPanel
        :sale="sale"
        :parked-count="parked.length"
        @qty="onQty"
        @edit="editLine"
        @discount="onDiscount"
        @note="onNote"
        @customer="onCustomer"
        @clear="onClear"
        @park="onPark"
        @parked="parkedOpen = true"
        @charge="payOpen = true"
      />
    </Drawer>

    <ModifierDialog v-model:visible="modOpen" :item="modItem" :groups="modItem ? cat.groupsFor(modItem.id) : []" :initial="modInitial" @confirm="onMods" />
    <PaymentDialog v-model:visible="payOpen" :total="sale?.total ?? 0" :customer-name="sale?.customer_name" @pay="onPay" />

    <Dialog v-model:visible="parkOpen" modal :header="t('pos.park.park')" class="w-[min(24rem,calc(100vw-1.5rem))]">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('pos.park.label') }}</span>
        <InputText v-model="parkLabel" autofocus @keydown.enter="doPark" />
      </label>
      <template #footer>
        <Button :label="t('pos.c.cancel')" text @click="parkOpen = false" />
        <Button :label="t('pos.park.park')" icon="pi pi-pause" @click="doPark" />
      </template>
    </Dialog>

    <Dialog v-model:visible="parkedOpen" modal :header="t('pos.park.list')" class="w-[min(26rem,calc(100vw-1.5rem))]">
      <p v-if="!parked.length" class="text-sm text-[var(--k-muted)]">{{ t('pos.park.none') }}</p>
      <ul class="divide-y divide-[var(--k-border)]">
        <li v-for="p in parked" :key="p.id">
          <button type="button" class="flex w-full items-center gap-3 py-2 text-left" @click="resume(p)">
            <i class="pi pi-inbox text-[var(--k-muted)]" />
            <span class="flex-1">
              <span class="block font-medium">{{ p.parked_label }}</span>
              <span class="text-xs text-[var(--k-muted)]">{{ t('pos.sell.cartItems', { n: p.items }) }} · {{ new Date(p.updated_at).toLocaleTimeString() }}</span>
            </span>
            <span class="font-semibold tabular-nums">{{ shop.fmt(p.total) }}</span>
          </button>
        </li>
      </ul>
    </Dialog>

    <Dialog :visible="!!paid" modal :closable="false" :header="t('pos.sell.paid')" class="w-[min(26rem,calc(100vw-1.5rem))]">
      <div v-if="paid" class="flex flex-col items-center gap-2 text-center">
        <i class="pi pi-check-circle text-5xl text-primary-600" />
        <div class="text-sm text-[var(--k-muted)]">#{{ paid.number }}<template v-if="paid.customer_name"> · {{ paid.customer_name }}</template></div>
        <div class="text-2xl font-bold">{{ shop.fmt(paid.total) }}</div>
        <div v-if="paid.payments[0]?.method === 'DEBT'" class="text-amber-600">{{ t('pos.sell.method.debt') }}</div>
        <div v-else-if="paid.payments[0]?.change_due" class="text-lg">
          {{ t('pos.sell.change') }}: <b>{{ shop.fmt(paid.payments[0].change_due) }}</b>
        </div>
      </div>
      <template #footer>
        <Button :label="t('pos.sell.printReceipt')" icon="pi pi-print" outlined @click="onPrint" />
        <Button :label="t('pos.sell.newSale')" icon="pi pi-plus" autofocus @click="paid = null" />
      </template>
    </Dialog>
    <PrintSheet v-model:open="printing" :paper-mm="shop.shop?.paper_mm">
      <Receipt v-if="paid" :sale="paid" />
    </PrintSheet>
  </div>
</template>
