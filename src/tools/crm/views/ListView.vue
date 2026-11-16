<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import CustomerForm from '../components/CustomerForm.vue'
import { db } from '../db'
import { listCustomers, tagList, type CustomerRow } from '../db/data'
import { useCrm } from '../store'
import { formatMoney } from '@/core/util/money'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const crm = useCrm()
const search = ref('')
const tag = ref<string | null>(null)
const sort = ref<'name' | 'owed' | 'recent'>('name')
const onlyOwing = ref(route.query.owing === '1')
const rows = ref<CustomerRow[]>([])

async function load() {
  rows.value = await listCustomers(db, { search: search.value, tag: tag.value, sort: onlyOwing.value ? 'owed' : sort.value, onlyOwing: onlyOwing.value })
}
watch([search, tag, sort, onlyOwing, () => crm.version], load, { immediate: true })

const sorts = computed(() => [
  { label: t('crm.sort.name'), value: 'name' },
  { label: t('crm.sort.recent'), value: 'recent' },
  { label: t('crm.sort.owed'), value: 'owed' },
])
const tagOptions = computed(() => [{ label: t('crm.allTags'), value: null }, ...crm.tags.map((x) => ({ label: x, value: x }))])
const formOpen = ref(false)
async function saved(id: string) {
  await crm.load()
  router.push(`/c/${id}`)
}
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">{{ t('crm.nav.list') }} <span class="text-base font-normal text-[var(--k-muted)]">({{ rows.length }})</span></h1>
      <Button :label="t('crm.newCustomer')" icon="pi pi-user-plus" size="small" @click="formOpen = true" />
    </div>
    <div class="flex flex-wrap gap-2">
      <IconField class="min-w-0 flex-1">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" :placeholder="t('crm.search')" class="w-full" />
      </IconField>
      <Select v-model="tag" :options="tagOptions" option-label="label" option-value="value" :placeholder="t('crm.allTags')" class="w-36" />
      <Select v-model="sort" :options="sorts" option-label="label" option-value="value" class="w-36" />
      <Button :label="t('crm.onlyOwing')" :outlined="!onlyOwing" size="small" @click="onlyOwing = !onlyOwing" />
    </div>

    <p v-if="!rows.length" class="rounded-xl border border-dashed border-[var(--k-border)] py-10 text-center text-[var(--k-muted)]">{{ t('crm.empty') }}</p>
    <ul v-else class="divide-y divide-[var(--k-border)] rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)]">
      <li v-for="c in rows" :key="c.id">
        <RouterLink :to="`/c/${c.id}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--k-border)]/30">
          <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">{{ initials(c.name) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ c.name }}</span>
            <span class="flex flex-wrap items-center gap-1 text-xs text-[var(--k-muted)]">
              <span v-if="c.phone">{{ c.phone }}</span>
              <span v-for="x in tagList(c.tags)" :key="x" class="rounded bg-[var(--k-border)]/60 px-1.5">{{ x }}</span>
              <span v-if="c.next_due" class="text-amber-700 dark:text-amber-400"><i class="pi pi-bell text-[10px]" /> {{ c.next_due }}</span>
            </span>
          </span>
          <span v-if="c.owe_khr > 0 || c.owe_usd > 0" class="text-right text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            <span v-if="c.owe_khr > 0" class="block">{{ formatMoney(c.owe_khr, 'KHR') }}</span>
            <span v-if="c.owe_usd > 0" class="block">{{ formatMoney(c.owe_usd, 'USD') }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <CustomerForm v-model:visible="formOpen" :customer="null" @saved="saved" />
  </div>
</template>
