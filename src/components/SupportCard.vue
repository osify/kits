<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SUPPORT_URL, MEMBERSHIP_URL } from '@/core/support'

/**
 * Buy Me a Coffee card. `compact` = one line (tool footers).
 * `license` = also explain that monthly members get a Kitroid Pro key.
 */
defineProps<{ compact?: boolean; license?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <p v-if="compact" class="no-print text-center text-xs text-[var(--k-muted)]">
    {{ t('common.support.short') }}
    <a :href="SUPPORT_URL" target="_blank" rel="noopener" class="font-semibold text-amber-700 underline dark:text-amber-400">☕ {{ t('common.support.cta') }}</a>
  </p>
  <section
    v-else
    class="no-print flex flex-col gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
  >
    <a :href="license ? MEMBERSHIP_URL : SUPPORT_URL" target="_blank" rel="noopener" class="shrink-0 self-start rounded-lg bg-white p-1 shadow-sm" aria-label="Buy Me a Coffee QR code">
      <img src="/support/buymeacoffee-qr.webp" alt="QR code: buymeacoffee.com/mtstuffs" width="96" height="96" loading="lazy" class="size-24" />
    </a>
    <div class="min-w-0 flex-1 text-sm">
      <h3 class="text-base font-semibold">{{ license ? t('common.support.memberTitle') : t('common.support.title') }}</h3>
      <p class="mt-1">{{ license ? t('common.support.memberBody') : t('common.support.body') }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <a v-if="license" :href="MEMBERSHIP_URL" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">
          <i class="pi pi-key" /> {{ t('common.support.memberCta') }}
        </a>
        <a :href="SUPPORT_URL" target="_blank" rel="noopener" :class="license ? 'underline' : 'inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700'">
          ☕ {{ t('common.support.cta') }}
        </a>
        <span class="text-xs opacity-75">buymeacoffee.com/mtstuffs</span>
      </div>
    </div>
  </section>
</template>
