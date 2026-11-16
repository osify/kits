<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Trust, Verified } from '@/core/exchange/sign'

/**
 * What the signature of a Kitroid code tells the receiver, in plain words.
 * Without a trust list (e.g. a patient), a valid signature shows the key fingerprint only.
 */
const props = defineProps<{ verified: Verified | null; trust?: Trust | null; claimed: string }>()
const emit = defineEmits<{ trust: [] }>()
const { t } = useI18n()
const view = computed(() => {
  const v = props.verified
  if (!v) return null
  if (v.status === 'invalid') return { cls: 'border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100', icon: 'pi-ban', text: t('kx.sig.invalid') }
  if (v.status === 'unsigned') return { cls: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100', icon: 'pi-question-circle', text: t('kx.sig.unsigned') }
  const tr = props.trust
  if (!tr) return { cls: 'border-primary-300 bg-primary-50 text-primary-900 dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-100', icon: 'pi-verified', text: t('kx.sig.signed', { fp: v.fingerprint }) }
  if (tr.level === 'trusted')
    return { cls: 'border-primary-300 bg-primary-50 text-primary-900 dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-100', icon: 'pi-verified', text: t('kx.sig.trusted', { name: tr.signer.name, fp: v.fingerprint }) }
  if (tr.level === 'unknown' && tr.sameName)
    return { cls: 'border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100', icon: 'pi-exclamation-triangle', text: t('kx.sig.otherKey', { name: tr.sameName.name, fp: v.fingerprint, known: tr.sameName.fingerprint }) }
  return { cls: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100', icon: 'pi-question-circle', text: t('kx.sig.unknown', { name: props.claimed, fp: v.fingerprint }), canTrust: true }
})
</script>

<template>
  <div v-if="view" class="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" :class="view.cls" role="status">
    <i class="pi mt-0.5" :class="view.icon" />
    <div class="min-w-0 flex-1">
      <p>{{ view.text }}</p>
      <button v-if="view.canTrust" type="button" class="mt-1 text-sm font-semibold underline" @click="emit('trust')">{{ t('kx.trustThis') }}</button>
    </div>
  </div>
</template>
