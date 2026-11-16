<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import AmountField from '../components/AmountField.vue'
import RestoreBox from '../components/RestoreBox.vue'
import { db } from '../db'
import { setupBook, type AccountKind } from '../db/data'
import { useBook } from '../store'
import { requestPersist } from '@/core/util/storage'
import { prefs } from '@/core/util/prefs'
import type { Currency } from '@/core/util/money'

/** First run: name the book, choose accounts and their starting balances. Or restore. */
const { t } = useI18n()
const router = useRouter()
const book = useBook()
const restoring = ref(false)
const saving = ref(false)
const f = reactive({ name: '', base: 'KHR' as Currency, rate: 4100 as number | null, accept: false })
const accounts = reactive([
  { on: true, name: t('money.preset.cashKhr'), kind: 'CASH' as AccountKind, currency: 'KHR' as Currency, opening: 0 },
  { on: true, name: t('money.preset.cashUsd'), kind: 'CASH' as AccountKind, currency: 'USD' as Currency, opening: 0 },
  { on: true, name: t('money.preset.bank'), kind: 'BANK' as AccountKind, currency: 'USD' as Currency, opening: 0 },
  { on: false, name: t('money.preset.wallet'), kind: 'WALLET' as AccountKind, currency: 'KHR' as Currency, opening: 0 },
])
const currencies = [
  { label: '៛ KHR', value: 'KHR' },
  { label: '$ USD', value: 'USD' },
]
const valid = computed(() => f.name.trim() && f.accept && accounts.some((a) => a.on && a.name.trim()))

async function start() {
  if (!valid.value) return
  saving.value = true
  try {
    await setupBook(
      db,
      f.name.trim(),
      f.base,
      f.rate || 4100,
      accounts.filter((a) => a.on && a.name.trim()).map((a) => ({ name: a.name.trim(), kind: a.kind, currency: a.currency, opening: a.opening })),
    )
    prefs.set('money.firstUse', String(Date.now()))
    await requestPersist()
    await book.load()
    router.replace('/')
  } finally {
    saving.value = false
  }
}
async function restored() {
  history.replaceState(null, '', '/money/#/')
  location.reload()
}
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('money.welcome.title') }}</h1>
      <p class="text-[var(--k-muted)]">{{ t('money.tagline') }}</p>
    </div>

    <section v-if="!restoring" class="flex flex-col gap-4 rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <label class="field"><span>{{ t('money.welcome.name') }}</span><InputText v-model="f.name" :placeholder="t('money.welcome.namePh')" autofocus /></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="field">
          <span>{{ t('money.welcome.base') }}</span>
          <SelectButton v-model="f.base" :options="currencies" option-label="label" option-value="value" :allow-empty="false" />
        </div>
        <label class="field"><span>{{ t('money.welcome.rate') }}</span><InputNumber v-model="f.rate" :min="1000" :max="10000" suffix=" ៛" /></label>
      </div>

      <div class="field">
        <span>{{ t('money.welcome.accounts') }}</span>
        <small class="text-[var(--k-muted)]">{{ t('money.welcome.accountsHint') }}</small>
        <div v-for="(a, i) in accounts" :key="i" class="grid grid-cols-[auto_1fr_8rem] items-center gap-2">
          <Checkbox v-model="a.on" binary :input-id="`acc${i}`" />
          <InputText v-model="a.name" :disabled="!a.on" :aria-label="t('money.accountName')" />
          <AmountField v-model="a.opening" :currency="a.currency" :input-id="`open${i}`" />
        </div>
      </div>

      <Message severity="warn" :closable="false">{{ t('money.welcome.disclaimer') }}</Message>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="f.accept" binary /> {{ t('money.welcome.accept') }}</label>
      <div class="flex flex-wrap items-center gap-2">
        <Button :label="t('money.welcome.start')" icon="pi pi-check" :disabled="!valid" :loading="saving" @click="start" />
        <span class="flex-1" />
        <Button :label="t('money.welcome.restore')" text @click="restoring = true" />
      </div>
    </section>

    <section v-else class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
      <RestoreBox @restored="restored" />
      <Button class="mt-3" :label="t('money.back')" text icon="pi pi-arrow-left" @click="restoring = false" />
    </section>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
}
</style>
