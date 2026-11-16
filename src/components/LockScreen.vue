<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { AppLock } from '@/core/privacy/lock'

/**
 * Full-screen PIN prompt over a private tool (nothing of the tool is rendered behind it).
 * Also covers the screen while the app is in the background, so app-switcher previews show nothing.
 */
const props = defineProps<{ lock: AppLock; title: string }>()
const { t } = useI18n()
const pin = ref('')
const msg = ref('')
const busy = ref(false)
const s = props.lock.state
const input = ref<HTMLInputElement | null>(null)
watch(
  () => s.locked,
  async (v) => {
    if (!v) return
    await nextTick()
    input.value?.focus()
  },
  { immediate: true },
)
const waitMin = computed(() => Math.max(1, Math.ceil((s.waitUntil - Date.now()) / 60_000)))

async function submit() {
  if (!pin.value || busy.value) return
  busy.value = true
  const r = await props.lock.unlock(pin.value)
  busy.value = false
  pin.value = ''
  input.value?.focus()
  msg.value = r === 'wrong' ? t('privacy.wrongPin') : r === 'wait' ? t('privacy.wait', { n: waitMin.value }) : ''
}
function key(d: string) {
  if (d === '<') pin.value = pin.value.slice(0, -1)
  else if (pin.value.length < 12) pin.value += d
  msg.value = ''
}
</script>

<template>
  <div v-if="s.locked || s.hidden" class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[var(--k-bg)] p-6">
    <template v-if="s.locked">
      <img src="/icons/kitroid.svg" alt="" class="size-12" />
      <div class="text-center">
        <h1 class="text-lg font-semibold">{{ title }}</h1>
        <p class="text-sm text-[var(--k-muted)]"><i class="pi pi-lock mr-1" />{{ t('privacy.locked') }}</p>
      </div>
      <form class="flex w-full max-w-xs flex-col items-center gap-3" @submit.prevent="submit">
        <input
          ref="input"
          v-model="pin"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          :aria-label="t('privacy.pin')"
          class="w-full rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] px-4 py-3 text-center text-2xl tracking-[0.5em]"
        />
        <p class="min-h-5 text-sm text-red-600 dark:text-red-400" role="alert">{{ msg }}</p>
        <div class="grid w-full grid-cols-3 gap-2">
          <button
            v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0']"
            :key="d"
            type="button"
            class="rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] py-3 text-xl font-semibold active:bg-[var(--k-border)]"
            :aria-label="d === '<' ? t('privacy.backspace') : d"
            @click="key(d)"
          >
            <i v-if="d === '<'" class="pi pi-delete-left" /><template v-else>{{ d }}</template>
          </button>
          <Button type="submit" icon="pi pi-unlock" :loading="busy" :aria-label="t('privacy.unlock')" class="!h-full !w-full !rounded-xl" />
        </div>
      </form>
      <p class="max-w-xs text-center text-xs text-[var(--k-muted)]">{{ t('privacy.forgot') }}</p>
    </template>
    <template v-else>
      <img src="/icons/kitroid.svg" alt="" class="size-12 opacity-60" />
    </template>
  </div>
</template>
