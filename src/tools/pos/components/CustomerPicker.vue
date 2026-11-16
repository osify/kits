<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'
import CustomerDialog from './CustomerDialog.vue'
import { listCustomers, type CustomerRow } from '../db/customers'
import { useShopStore } from '../stores/shop'

/** Pick (or quickly add) the customer for a sale. v-model = customer id. */
const props = defineProps<{ name?: string | null }>()
const id = defineModel<string | null>({ default: null })
const { t } = useI18n()
const shop = useShopStore()
const query = ref<string | CustomerRow>('')
const suggestions = ref<CustomerRow[]>([])
const addOpen = ref(false)

watch(
  () => props.name,
  (n) => (query.value = n ?? ''),
  { immediate: true },
)

async function search(e: { query: string }) {
  suggestions.value = (await listCustomers(shop.base, e.query)).slice(0, 20)
}
function onSelect(e: { value: CustomerRow }) {
  id.value = e.value.id
}
function clear() {
  id.value = null
  query.value = ''
}
const typed = computed(() => (typeof query.value === 'string' ? query.value : ''))
</script>

<template>
  <div class="flex items-center gap-1">
    <AutoComplete
      v-model="query"
      :suggestions="suggestions"
      option-label="name"
      :placeholder="t('pos.cust.pick')"
      class="min-w-0 flex-1"
      input-class="w-full"
      dropdown
      complete-on-focus
      @complete="search"
      @option-select="onSelect"
    >
      <template #option="{ option }">
        <div class="flex w-full justify-between gap-3">
          <span>{{ option.name }}<small v-if="option.phone" class="text-[var(--k-muted)]"> · {{ option.phone }}</small></span>
          <small v-if="option.balance" class="text-amber-600">{{ shop.fmt(option.balance) }}</small>
        </div>
      </template>
    </AutoComplete>
    <Button v-if="id" icon="pi pi-times" text rounded size="small" :aria-label="t('pos.cust.remove')" @click="clear" />
    <Button v-else icon="pi pi-user-plus" text rounded size="small" :aria-label="t('pos.cust.new')" @click="addOpen = true" />
    <CustomerDialog v-model:visible="addOpen" :customer="null" :initial-name="typed" @saved="(v) => (id = v)" />
  </div>
</template>
