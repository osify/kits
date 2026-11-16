<script setup lang="ts">
import SupportCard from '@/components/SupportCard.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { applyLicenseKey, FEATURE_PLANS, PLAN_LIMITS, hasFeature, license, licenseExpired, plan, type Feature, type Plan } from '@/core/license'
import { setSetting } from '../db'

/** Plan & license key. Keys are verified offline; stored in the database so backups keep them. */
const { t } = useI18n()
const toast = useToast()
const key = ref('')

async function activate() {
  const r = await applyLicenseKey(key.value)
  if (r?.ok) {
    await setSetting('license', key.value.trim())
    key.value = ''
    toast.add({ severity: r.expired ? 'warn' : 'success', summary: r.expired ? t('pos.plan.expired') : t('pos.plan.activated'), life: 3000 })
  } else toast.add({ severity: 'error', summary: t('pos.plan.invalid'), life: 4000 })
}
async function remove() {
  await applyLicenseKey(null)
  await setSetting('license', '')
}
const features = Object.keys(FEATURE_PLANS) as Feature[]
const plans: Plan[] = ['free', 'pro', 'business']
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-4">
    <section class="card flex flex-wrap items-center gap-3">
      <i class="pi pi-verified text-2xl text-primary-600" />
      <div class="min-w-0 flex-1">
        <div class="font-semibold">{{ t(`pos.plan.name.${plan}`) }}</div>
        <div v-if="license" class="text-sm text-[var(--k-muted)]">
          {{ license.name }}<template v-if="license.exp"> · {{ t('pos.plan.until', { date: license.exp }) }}</template>
        </div>
        <div v-else class="text-sm text-[var(--k-muted)]">{{ t('pos.plan.freeBody') }}</div>
      </div>
      <Tag v-if="licenseExpired" severity="danger" :value="t('pos.plan.expired')" />
      <Button v-if="license" :label="t('pos.plan.remove')" text severity="secondary" size="small" @click="remove" />
    </section>

    <section class="card">
      <h3 class="mb-3 font-semibold">{{ t('pos.plan.features') }}</h3>
      <ul class="grid gap-x-10 gap-y-3 text-sm sm:grid-cols-2">
        <li v-for="f in features" :key="f" class="flex items-center gap-2.5">
          <i :class="hasFeature(f) ? 'pi pi-check-circle text-primary-600' : 'pi pi-lock text-[var(--k-muted)]'" />
          <span class="min-w-0 flex-1">{{ t(`pos.plan.feature.${f}`) }}</span>
          <Tag :severity="FEATURE_PLANS[f] === 'free' ? 'success' : 'info'" :value="t(`pos.plan.name.${FEATURE_PLANS[f]}`)" />
        </li>
      </ul>
    </section>

    <section class="card">
      <h3 class="mb-3 font-semibold">{{ t('pos.plan.limits') }}</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-[var(--k-muted)]">
            <tr>
              <th class="pb-2 font-normal" />
              <th v-for="p in plans" :key="p" class="px-3 pb-2 text-right font-normal" :class="{ 'font-semibold text-[var(--k-text)]': p === plan }">
                {{ t(`pos.plan.name.${p}`) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-t border-[var(--k-border)]">
              <td class="py-2.5 pr-3">{{ t('pos.plan.itemsOnSale') }}</td>
              <td v-for="p in plans" :key="p" class="px-3 py-2.5 text-right tabular-nums" :class="{ 'font-semibold': p === plan }">
                {{ Number.isFinite(PLAN_LIMITS[p].items) ? PLAN_LIMITS[p].items : t('pos.plan.unlimited') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <SupportCard license />

    <section class="card flex flex-col gap-3">
      <h3 class="font-semibold">{{ t('pos.plan.enterKey') }}</h3>
      <Textarea v-model="key" rows="3" auto-resize placeholder="KIT1.…" class="w-full font-mono text-xs" />
      <div class="flex flex-wrap items-center gap-3">
        <Button :label="t('pos.plan.activate')" icon="pi pi-key" :disabled="!key.trim()" @click="activate" />
        <p class="text-xs text-[var(--k-muted)]">{{ t('pos.plan.offlineNote') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid var(--k-border);
  background: var(--k-surface);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
}
</style>
