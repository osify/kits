<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import PersonDialog from '../components/PersonDialog.vue'
import { useHealth } from '../store'
import { age } from '../rules'
import { today } from '@/core/util/date'

/** Family members. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const hl = useHealth()
const adding = ref(false)
onMounted(() => {
  if (route.query.add) adding.value = true
})
const ageText = (birth: string | null) => {
  const a = age(birth, today())
  if (!a) return ''
  return a.years >= 2 ? t('hl.years', { n: a.years }) : t('hl.months', { n: a.months })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('hl.nav.family') }}</h1>
      <Button :label="t('hl.addPerson')" icon="pi pi-plus" @click="adding = true" />
    </div>
    <p v-if="!hl.people.length" class="py-6 text-center text-[var(--k-muted)]">{{ t('hl.emptyFamily') }}</p>
    <ul class="grid gap-3 sm:grid-cols-2">
      <li v-for="p in hl.people" :key="p.id">
        <RouterLink :to="`/p/${p.id}`" class="card flex items-center gap-3 hover:border-primary-500">
          <span class="grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white" :style="{ background: p.color || '#059669' }">{{ [...p.name][0] }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ p.name }}</span>
            <span class="block text-sm text-[var(--k-muted)]">{{ [p.relation, ageText(p.birth_date), p.blood_type].filter(Boolean).join(' · ') }}</span>
            <span v-if="p.allergies" class="block truncate text-xs font-semibold text-red-700 dark:text-red-400"><i class="pi pi-exclamation-triangle mr-1 text-[10px]" />{{ p.allergies }}</span>
          </span>
          <i class="pi pi-chevron-right text-[var(--k-muted)]" />
        </RouterLink>
      </li>
    </ul>
    <PersonDialog v-model:open="adding" @saved="(id) => router.push(`/p/${id}`)" />
  </div>
</template>
