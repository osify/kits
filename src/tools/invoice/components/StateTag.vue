<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import type { DocState } from '../db/data'

/** Document badge: word + icon, never colour alone. */
const props = defineProps<{ state: DocState }>()
const { t } = useI18n()
const look = computed(
  () =>
    ({
      draft: ['secondary', 'pi-pencil'],
      sent: ['info', 'pi-send'],
      accepted: ['success', 'pi-check'],
      declined: ['secondary', 'pi-times'],
      expired: ['secondary', 'pi-clock'],
      unpaid: ['info', 'pi-circle'],
      partial: ['warn', 'pi-hourglass'],
      paid: ['success', 'pi-check-circle'],
      overdue: ['danger', 'pi-exclamation-triangle'],
      void: ['secondary', 'pi-ban'],
    })[props.state] as [string, string],
)
</script>

<template>
  <Tag :severity="look[0]" :icon="`pi ${look[1]}`" :value="t(`iv.state.${state}`)" />
</template>
