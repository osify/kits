<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import type { AppLock } from '@/core/privacy/lock'

/**
 * Privacy settings for a private tool: PIN lock, auto-lock time, lock now, and delete
 * everything stored on this device (`wipe` is provided by the tool).
 */
const props = defineProps<{ lock: AppLock; wipe: () => Promise<void>; what: string }>()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const s = props.lock.state
const f = reactive({ open: false, old: '', pin: '', pin2: '', err: '' })
const minutes = [1, 2, 5, 10, 30].map((n) => ({ label: t('privacy.minutes', { n }), value: n }))

function openPin() {
  Object.assign(f, { open: true, old: '', pin: '', pin2: '', err: '' })
}
const valid = () => /^\d{4,12}$/.test(f.pin) && f.pin === f.pin2
async function savePin() {
  if (!valid()) return
  if (s.enabled && !(await props.lock.check(f.old))) return void (f.err = t('privacy.wrongPin'))
  await props.lock.setPin(f.pin)
  f.open = false
  toast.add({ severity: 'success', summary: t('privacy.pinSet'), life: 3000 })
}
const off = reactive({ open: false, pin: '', err: '' })
async function removePin() {
  if (!(await props.lock.check(off.pin))) return void (off.err = t('privacy.wrongPin'))
  props.lock.removePin()
  off.open = false
}
function wipeAll() {
  confirm.require({
    header: t('privacy.wipeTitle'),
    message: t('privacy.wipeConfirm', { what: props.what }),
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('privacy.wipeNow'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await props.wipe()
      props.lock.removePin()
      location.reload()
    },
  })
}
</script>

<template>
  <section class="card flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <i class="pi pi-shield text-xl" />
      <h2 class="flex-1 font-semibold">{{ t('privacy.title') }}</h2>
      <Tag :severity="s.enabled ? 'success' : 'secondary'" :value="s.enabled ? t('privacy.lockOn') : t('privacy.lockOff')" />
    </div>
    <p class="text-sm text-[var(--k-muted)]">{{ t('privacy.body') }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <Button :label="s.enabled ? t('privacy.changePin') : t('privacy.setPin')" icon="pi pi-lock" :outlined="s.enabled" @click="openPin" />
      <template v-if="s.enabled">
        <Select :model-value="s.minutes" :options="minutes" option-label="label" option-value="value" :aria-label="t('privacy.autoLock')" @update:model-value="lock.setMinutes" />
        <Button :label="t('privacy.lockNow')" icon="pi pi-lock" text @click="lock.lockNow" />
        <Button :label="t('privacy.removePin')" text severity="secondary" @click="Object.assign(off, { open: true, pin: '', err: '' })" />
      </template>
    </div>
    <Message severity="secondary" :closable="false" class="text-xs">{{ t('privacy.honest') }}</Message>
    <div class="border-t border-[var(--k-border)] pt-3">
      <Button :label="t('privacy.wipe')" icon="pi pi-trash" severity="danger" text @click="wipeAll" />
      <p class="text-xs text-[var(--k-muted)]">{{ t('privacy.wipeHint') }}</p>
    </div>

    <Dialog v-model:visible="f.open" modal :header="s.enabled ? t('privacy.changePin') : t('privacy.setPin')" class="w-[min(22rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="savePin">
        <label v-if="s.enabled" class="field"><span>{{ t('privacy.oldPin') }}</span><input v-model="f.old" type="password" inputmode="numeric" autocomplete="off" class="rounded-lg border border-[var(--k-border)] bg-transparent px-3 py-2" /></label>
        <label class="field"><span>{{ t('privacy.newPin') }}</span><input v-model="f.pin" type="password" inputmode="numeric" autocomplete="off" class="rounded-lg border border-[var(--k-border)] bg-transparent px-3 py-2" /></label>
        <label class="field"><span>{{ t('privacy.newPin2') }}</span><input v-model="f.pin2" type="password" inputmode="numeric" autocomplete="off" class="rounded-lg border border-[var(--k-border)] bg-transparent px-3 py-2" /></label>
        <small class="text-[var(--k-muted)]">{{ t('privacy.pinRule') }}</small>
        <small v-if="f.err" class="text-red-600">{{ f.err }}</small>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="f.open = false" />
          <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!valid()" />
        </div>
      </form>
    </Dialog>
    <Dialog v-model:visible="off.open" modal :header="t('privacy.removePin')" class="w-[min(22rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="removePin">
        <label class="field"><span>{{ t('privacy.oldPin') }}</span><input v-model="off.pin" type="password" inputmode="numeric" autocomplete="off" class="rounded-lg border border-[var(--k-border)] bg-transparent px-3 py-2" /></label>
        <small v-if="off.err" class="text-red-600">{{ off.err }}</small>
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="off.open = false" />
          <Button type="submit" :label="t('privacy.removePin')" severity="danger" :disabled="!off.pin" />
        </div>
      </form>
    </Dialog>
  </section>
</template>
