<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { imageUrl } from '@/core/files/images'

/** Item picture: photo if any, otherwise its emoji icon, otherwise initials. */
const props = defineProps<{ path?: string | null; icon?: string | null; name: string; color?: string | null; size?: 'sm' | 'md' | 'lg' }>()
const url = ref<string | null>(null)

watchEffect(async () => {
  url.value = props.path ? await imageUrl('pos', props.path) : null
})

const initials = (n: string) =>
  n
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
</script>

<template>
  <span
    class="grid shrink-0 place-items-center overflow-hidden rounded-lg"
    :class="{ 'size-9 text-lg': size === 'sm', 'size-14 text-3xl': !size || size === 'md', 'size-24 text-5xl': size === 'lg' }"
    :style="{ background: url ? undefined : (color || '#059669') + '22' }"
  >
    <img v-if="url" :src="url" alt="" class="size-full object-cover" loading="lazy" />
    <span v-else-if="icon" aria-hidden="true">{{ icon }}</span>
    <span v-else class="text-sm font-semibold" :style="{ color: color || '#059669' }">{{ initials(name) }}</span>
  </span>
</template>
