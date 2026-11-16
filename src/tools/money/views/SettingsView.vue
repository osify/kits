<script setup lang="ts">
import SupportCard from '@/components/SupportCard.vue'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { saveAccount, saveCategory, type AccountBalance, type AccountKind, type Category } from '../db/data'
import { useBook, catName } from '../store'
import { formatMoney, type Currency } from '@/core/util/money'

const { t, locale } = useI18n()
const toast = useToast()
const book = useBook()

// book
const bookName = ref(book.name)
const rate = ref<number | null>(book.rate)
async function saveBook() {
  if (bookName.value.trim()) await book.setName(bookName.value.trim())
  if (rate.value) await book.setRate(rate.value)
  toast.add({ severity: 'success', summary: t('money.saved'), life: 1500 })
}

// accounts
const accOpen = ref(false)
const acc = reactive({ id: '' as string | undefined, name: '', kind: 'CASH' as AccountKind, currency: 'KHR' as Currency, opening: 0, active: true })
const kinds = computed(() => (['CASH', 'BANK', 'WALLET', 'OTHER'] as AccountKind[]).map((k) => ({ label: t(`money.accKind.${k}`), value: k })))
const currencies = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
function openAcc(a: AccountBalance | null) {
  Object.assign(acc, a ? { id: a.id, name: a.name, kind: a.kind, currency: a.currency, opening: a.opening, active: !!a.active } : { id: undefined, name: '', kind: 'CASH', currency: book.base, opening: 0, active: true })
  accOpen.value = true
}
async function saveAcc() {
  if (!acc.name.trim()) return
  await saveAccount(db, { id: acc.id, name: acc.name.trim(), kind: acc.kind, currency: acc.currency, opening: acc.opening, active: acc.active ? 1 : 0 })
  accOpen.value = false
  await book.load()
}

// categories
const catOpen = ref(false)
const cat = reactive({ id: '' as string | undefined, kind: 'OUT' as 'IN' | 'OUT', name: '', name_km: '', icon: '', active: true })
function openCat(c: Category | null, kind: 'IN' | 'OUT' = 'OUT') {
  Object.assign(cat, c ? { id: c.id, kind: c.kind, name: c.name, name_km: c.name_km ?? '', icon: c.icon ?? '', active: !!c.active } : { id: undefined, kind, name: '', name_km: '', icon: '', active: true })
  catOpen.value = true
}
async function saveCat() {
  if (!cat.name.trim() && !cat.name_km.trim()) return
  await saveCategory(db, { id: cat.id, kind: cat.kind, name: cat.name.trim() || cat.name_km.trim(), name_km: cat.name_km.trim() || null, icon: cat.icon.trim() || null, active: cat.active ? 1 : 0 })
  catOpen.value = false
  await book.load()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <h1 class="text-xl font-semibold">{{ t('money.nav.settings') }}</h1>

    <section class="grid gap-3 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <label class="field"><span>{{ t('money.welcome.name') }}</span><InputText v-model="bookName" /></label>
      <label class="field"><span>{{ t('money.welcome.rate') }}</span><InputNumber v-model="rate" :min="1000" :max="10000" suffix=" ៛" /></label>
      <Button :label="t('money.save')" icon="pi pi-check" @click="saveBook" />
      <p class="text-xs text-[var(--k-muted)] sm:col-span-3">{{ t('money.rateNote') }}</p>
    </section>

    <section>
      <div class="mb-2 flex items-center">
        <h2 class="flex-1 font-semibold">{{ t('money.accounts') }}</h2>
        <Button :label="t('money.addAccount')" icon="pi pi-plus" size="small" @click="openAcc(null)" />
      </div>
      <ul class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
        <li v-for="a in book.accounts" :key="a.id">
          <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left" :class="{ 'opacity-50': !a.active }" @click="openAcc(a)">
            <span class="flex-1">{{ a.name }} <small class="text-[var(--k-muted)]">· {{ t(`money.accKind.${a.kind}`) }}</small></span>
            <Tag v-if="!a.active" severity="secondary" :value="t('money.hidden')" />
            <span class="font-semibold tabular-nums">{{ formatMoney(a.balance, a.currency) }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-for="k in ['IN', 'OUT'] as const" :key="k">
      <div class="mb-2 flex items-center">
        <h2 class="flex-1 font-semibold">{{ k === 'IN' ? t('money.incomeCats') : t('money.expenseCats') }}</h2>
        <Button :label="t('money.addCategory')" icon="pi pi-plus" size="small" outlined @click="openCat(null, k)" />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in book.categories.filter((x) => x.kind === k)"
          :key="c.id"
          type="button"
          class="rounded-full border border-[var(--k-border)] bg-[var(--k-surface)] px-3 py-1 text-sm"
          :class="{ 'line-through opacity-50': !c.active }"
          @click="openCat(c)"
        >
          <span aria-hidden="true">{{ c.icon }}</span> {{ catName(c, locale) }}
        </button>
      </div>
    </section>

    <SupportCard />

    <Dialog v-model:visible="accOpen" modal :header="acc.id ? t('money.editAccount') : t('money.addAccount')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('money.accountName') }}</span><InputText v-model="acc.name" autofocus /></label>
        <div class="field"><span>{{ t('money.accountKind') }}</span><Select v-model="acc.kind" :options="kinds" option-label="label" option-value="value" /></div>
        <div class="field">
          <span>{{ t('money.currency') }}</span>
          <SelectButton v-model="acc.currency" :options="currencies" option-label="label" option-value="value" :allow-empty="false" :disabled="!!acc.id" />
          <small v-if="acc.id" class="text-[var(--k-muted)]">{{ t('money.currencyFixed') }}</small>
        </div>
        <label class="field"><span>{{ t('money.opening') }}</span><AmountField v-model="acc.opening" :currency="acc.currency" allow-negative /></label>
        <label v-if="acc.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="acc.active" /> {{ t('money.inUse') }}</label>
      </div>
      <template #footer>
        <Button :label="t('money.cancel')" text @click="accOpen = false" />
        <Button :label="t('money.save')" icon="pi pi-check" :disabled="!acc.name.trim()" @click="saveAcc" />
      </template>
    </Dialog>

    <Dialog v-model:visible="catOpen" modal :header="cat.id ? t('money.editCategory') : t('money.addCategory')" class="w-[min(26rem,calc(100vw-1rem))]">
      <div class="flex flex-col gap-3">
        <label class="field"><span>{{ t('money.nameKm') }}</span><InputText v-model="cat.name_km" /></label>
        <label class="field"><span>{{ t('money.nameEn') }}</span><InputText v-model="cat.name" /></label>
        <label class="field"><span>{{ t('money.icon') }}</span><InputText v-model="cat.icon" maxlength="4" placeholder="🧾" /></label>
        <label v-if="cat.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="cat.active" /> {{ t('money.inUse') }}</label>
      </div>
      <template #footer>
        <Button :label="t('money.cancel')" text @click="catOpen = false" />
        <Button :label="t('money.save')" icon="pi pi-check" :disabled="!cat.name.trim() && !cat.name_km.trim()" @click="saveCat" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}
</style>
