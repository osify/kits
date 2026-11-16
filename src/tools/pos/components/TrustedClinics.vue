<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import ScanCode from '@/components/ScanCode.vue'
import { decodeKx } from '@/core/exchange/codec'
import { verifyCode, type TrustedSigner } from '@/core/exchange/sign'
import { listTrusted, trustSigner, untrustSigner } from '../db/trust'

/** Pharmacy: clinics whose signed prescriptions show as verified. Add one by scanning its clinic card. */
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const rows = ref<TrustedSigner[]>([])
const scanning = ref(false)
const load = async () => (rows.value = await listTrusted())
onMounted(load)

async function onCode(text: string) {
  let card
  try {
    const d = decodeKx(text)
    if (d.type !== 'ck') throw new Error('UNKNOWN_TYPE')
    card = d.data
  } catch (e: any) {
    return void toast.add({ severity: 'error', summary: t(`kx.err.${e.message}`, t('kx.err.BAD_CODE')), life: 4000 })
  }
  const v = await verifyCode(text)
  if (v.status !== 'signed') return void toast.add({ severity: 'error', summary: t('kx.sig.invalid'), life: 5000 })
  confirm.require({
    header: t('kx.trustTitle'),
    message: t('kx.trustConfirm', { name: card.name, fp: v.fingerprint }),
    icon: 'pi pi-verified',
    acceptProps: { label: t('kx.trust') },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await trustSigner({ pub: v.pub, fingerprint: v.fingerprint, name: card.name, phone: card.phone })
      await load()
    },
  })
}
function remove(s: TrustedSigner) {
  confirm.require({
    message: t('kx.untrustConfirm', { name: s.name }),
    acceptProps: { label: t('kx.untrust'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), text: true },
    accept: async () => {
      await untrustSigner(s.pub)
      await load()
    },
  })
}
</script>

<template>
  <section class="max-w-3xl rounded-xl border border-[var(--k-border)] bg-[var(--k-surface)] px-5 py-4">
    <div class="mb-1 flex items-center gap-2">
      <i class="pi pi-verified text-xl" />
      <h3 class="flex-1 font-semibold">{{ t('kx.trustedTitle') }}</h3>
      <Button :label="t('kx.scanCard')" icon="pi pi-qrcode" size="small" outlined @click="scanning = true" />
    </div>
    <p class="mb-3 text-sm text-[var(--k-muted)]">{{ t('kx.trustedBody') }}</p>
    <p v-if="!rows.length" class="text-sm text-[var(--k-muted)]">{{ t('kx.noTrusted') }}</p>
    <ul v-else class="flex flex-col divide-y divide-[var(--k-border)]">
      <li v-for="s in rows" :key="s.pub" class="flex items-center gap-3 py-2">
        <i class="pi pi-verified text-primary-600" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ s.name }}</span>
          <span class="block font-mono text-xs text-[var(--k-muted)]">{{ s.fingerprint }}<template v-if="s.phone"> · {{ s.phone }}</template></span>
        </span>
        <Button icon="pi pi-trash" text rounded severity="secondary" size="small" :aria-label="t('kx.untrust')" @click="remove(s)" />
      </li>
    </ul>
    <ScanCode v-model:open="scanning" :title="t('kx.scanCard')" @code="onCode" />
  </section>
</template>
