<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { syncState, enableSync, disableSync, syncNow, refreshPending, syncIsStale } from '../sync'
import { driveConfigured, driveSignedIn, signIn } from '../backup/drive'
import { dbState } from '../db'
import { hasFeature } from '@/core/license'

/** Use the same shop on several phones / tablets / PCs, synced through the owner's Google Drive. */
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const allowed = computed(() => hasFeature('multiDevice'))
onMounted(refreshPending)

function errText(m: string) {
  return m === 'NEED_SIGN_IN' ? t('pos.bk.needSignIn') : m === 'NEED_UPDATE' ? t('pos.sync.needUpdate') : m
}

async function run() {
  try {
    if (!driveSignedIn.value) await signIn()
    const r = await syncNow()
    toast.add({ severity: 'success', summary: t('pos.sync.done', { pushed: r.pushed, applied: r.applied }), life: 2500 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: errText(e.message), life: 5000 })
  }
}

function turnOn() {
  confirm.require({
    header: t('pos.sync.title'),
    message: t('pos.sync.confirmOn'),
    icon: 'pi pi-sync',
    acceptProps: { label: t('pos.sync.turnOn') },
    rejectProps: { label: t('pos.c.cancel'), text: true },
    accept: async () => {
      await enableSync()
      await run()
    },
  })
}
</script>

<template>
  <section class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] p-4">
    <div class="mb-2 flex items-center gap-2">
      <i class="pi pi-sync text-xl" />
      <h2 class="flex-1 font-semibold">{{ t('pos.sync.title') }}</h2>
      <Tag v-if="syncState.enabled" severity="success" :value="t('pos.sync.on')" />
    </div>
    <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('pos.sync.body') }}</p>

    <Message v-if="!allowed" severity="info" :closable="false">{{ t('pos.plan.needs') }}</Message>
    <Message v-else-if="!driveConfigured" severity="secondary" :closable="false">{{ t('pos.bk.driveNotConfigured') }}</Message>
    <template v-else>
      <ol class="mb-3 list-inside list-decimal text-sm text-[var(--k-muted)]">
        <li>{{ t('pos.sync.step1') }}</li>
        <li>{{ t('pos.sync.step2') }}</li>
        <li>{{ t('pos.sync.step3') }}</li>
      </ol>

      <div v-if="!syncState.enabled" class="flex flex-wrap gap-2">
        <Button :label="t('pos.sync.turnOn')" icon="pi pi-sync" @click="turnOn" />
      </div>
      <template v-else>
        <dl class="mb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-[var(--k-muted)]">{{ t('pos.sync.last') }}</dt>
          <dd>{{ syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : t('pos.bk.never') }}</dd>
          <dt class="text-[var(--k-muted)]">{{ t('pos.sync.pending') }}</dt>
          <dd>{{ syncState.pending }}</dd>
          <dt class="text-[var(--k-muted)]">{{ t('pos.sync.devices') }}</dt>
          <dd>{{ syncState.devices || 1 }}</dd>
          <dt class="text-[var(--k-muted)]">{{ t('pos.sync.thisDevice') }}</dt>
          <dd class="font-mono text-xs">{{ dbState.deviceId.slice(-3) }}</dd>
        </dl>
        <Message v-if="syncIsStale()" severity="warn" :closable="false" class="mb-2">{{ t('pos.sync.stale') }}</Message>
        <Message v-if="syncState.lastError" severity="error" :closable="false" class="mb-2">{{ errText(syncState.lastError) }}</Message>
        <p v-if="!driveSignedIn" class="mb-2 text-sm text-amber-600">{{ t('pos.sync.signInHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="t('pos.sync.now')" icon="pi pi-sync" :loading="syncState.running" @click="run" />
          <Button :label="t('pos.sync.turnOff')" text severity="secondary" @click="disableSync" />
        </div>
      </template>
    </template>
  </section>
</template>
