<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import AmountField from '@/components/AmountField.vue'
import { db } from '../db'
import { listServices, saveService, type Service } from '../db/data'
import { useClinic } from '../store'
import { formatMoney } from '@/core/util/money'

/** Price list: consultations, procedures and tests (services), and medicines the clinic gives. */
const { t } = useI18n()
const cl = useClinic()
const rows = ref<Service[]>([])
const load = async () => (rows.value = await listServices(db, true))
onMounted(load)
const groups = computed(() => (['SERVICE', 'MEDICINE'] as const).map((k) => ({ kind: k, items: rows.value.filter((r) => r.kind === k) })))
const open = ref(false)
const f = reactive({ id: undefined as string | undefined, name: '', kind: 'SERVICE' as Service['kind'], price: 0, unit: '', active: true })
function edit(s?: Service, kind: Service['kind'] = 'SERVICE') {
  Object.assign(f, { id: s?.id, name: s?.name ?? '', kind: s?.kind ?? kind, price: s?.price ?? 0, unit: s?.unit ?? '', active: s ? !!s.active : true })
  open.value = true
}
async function save() {
  if (!f.name.trim()) return
  await saveService(db, { id: f.id, name: f.name, kind: f.kind, price: f.price, unit: f.unit, active: f.active ? 1 : 0 })
  open.value = false
  await Promise.all([load(), cl.load()])
}
const kindOpts = computed(() => [
  { label: t('cl.kind.SERVICE'), value: 'SERVICE' },
  { label: t('cl.kind.MEDICINE'), value: 'MEDICINE' },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">{{ t('cl.nav.prices') }}</h1>
    <section v-for="g in groups" :key="g.kind" class="card flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 font-semibold">{{ t(`cl.kindPlural.${g.kind}`) }}</h2>
        <Button :label="t('cl.addPrice')" icon="pi pi-plus" size="small" text @click="edit(undefined, g.kind)" />
      </div>
      <p v-if="!g.items.length" class="text-sm text-[var(--k-muted)]">{{ t('cl.noPrices') }}</p>
      <button
        v-for="s in g.items"
        :key="s.id"
        type="button"
        class="flex items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--k-border)]/40"
        :class="{ 'opacity-50': !s.active }"
        @click="edit(s)"
      >
        <span class="min-w-0 flex-1 truncate">{{ s.name }}<span v-if="s.id === cl.settings.consult_service" class="ml-2 text-xs text-primary-600">★ {{ t('cl.defaultFee') }}</span></span>
        <span class="tabular-nums">{{ formatMoney(s.price, cl.currency) }}<span v-if="s.unit" class="text-xs text-[var(--k-muted)]"> / {{ s.unit }}</span></span>
      </button>
    </section>

    <Dialog v-model:visible="open" modal :header="f.id ? t('cl.editPrice') : t('cl.addPrice')" class="w-[min(24rem,calc(100vw-1rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="save">
        <SelectButton v-model="f.kind" :options="kindOpts" option-label="label" option-value="value" :allow-empty="false" />
        <label class="field"><span>{{ t('hl.name') }}</span><InputText v-model="f.name" autofocus :placeholder="f.kind === 'MEDICINE' ? 'Amoxicillin 500 mg' : t('cl.servicePh')" /></label>
        <label class="field"><span>{{ t('cl.price') }}</span><AmountField v-model="f.price" :currency="cl.currency" /></label>
        <label v-if="f.kind === 'MEDICINE'" class="field"><span>{{ t('cl.unit') }}</span><InputText v-model="f.unit" :placeholder="t('cl.unitPh')" /></label>
        <label v-if="f.id" class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="f.active" /> {{ t('cl.inUse') }}</label>
        <Button
          v-if="f.id && f.kind === 'SERVICE' && f.id !== cl.settings.consult_service"
          :label="t('cl.makeDefaultFee')"
          icon="pi pi-star"
          text
          size="small"
          class="self-start"
          @click="cl.set('consult_service', f.id!)"
        />
        <div class="flex justify-end gap-2">
          <Button :label="t('common.cancel')" text @click="open = false" />
          <Button type="submit" :label="t('common.save')" icon="pi pi-check" :disabled="!f.name.trim()" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
