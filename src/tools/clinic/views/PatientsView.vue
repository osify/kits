<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import PatientDialog from '../components/PatientDialog.vue'
import { db } from '../db'
import { listPatients, type PatientRow } from '../db/data'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'

/** All patients, newest activity first; search by name, code or phone. */
const { t } = useI18n()
const router = useRouter()
const cl = useClinic()
const q = ref('')
const rows = ref<PatientRow[]>([])
const adding = ref(false)
let timer = 0
const load = async () => (rows.value = await listPatients(db, q.value))
onMounted(load)
watch(q, () => {
  clearTimeout(timer)
  timer = window.setTimeout(load, 150)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <h1 class="flex-1 text-xl font-semibold">{{ t('cl.nav.patients') }}</h1>
      <Button :label="t('cl.newPatient')" icon="pi pi-user-plus" @click="adding = true" />
    </div>
    <InputText v-model="q" :placeholder="t('cl.searchPatient')" />
    <p v-if="!rows.length" class="py-6 text-center text-[var(--k-muted)]">{{ t('cl.noPatients') }}</p>
    <ul v-else class="card flex flex-col divide-y divide-[var(--k-border)] !py-1">
      <li v-for="p in rows" :key="p.id">
        <RouterLink :to="`/p/${p.id}`" class="flex items-center gap-3 py-2">
          <span class="w-16 shrink-0 font-mono text-xs text-[var(--k-muted)]">{{ p.code }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ p.name }}</span>
            <span class="block text-xs text-[var(--k-muted)]">{{ [p.phone, t('cl.visitsCount', { n: p.visits }), p.last_date].filter(Boolean).join(' · ') }}</span>
          </span>
          <span v-if="p.owing > 0" class="text-sm font-semibold text-amber-700 dark:text-amber-400">{{ formatMoney(p.owing, cl.currency) }}</span>
          <i class="pi pi-chevron-right text-[var(--k-muted)]" />
        </RouterLink>
      </li>
    </ul>
    <PatientDialog v-model:open="adding" @saved="(id) => router.push(`/p/${id}`)" />
  </div>
</template>
