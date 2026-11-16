<script setup lang="ts">
import { computed } from 'vue'

import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{ city: string }>()

const preferences = usePreferencesStore()
const saved = computed(() => preferences.isSaved(props.city))

function toggle() {
  if (saved.value) preferences.removeCity(props.city)
  else preferences.saveCity(props.city)
}
</script>

<template>
  <button
    type="button"
    class="rounded-lg border px-4 py-2.5 text-sm font-medium"
    :class="
      saved
        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
        : 'border-sky-700 bg-sky-700 text-white hover:bg-sky-800'
    "
    :aria-pressed="saved"
    @click="toggle"
  >
    {{ saved ? 'Remove from saved' : 'Save city' }}
  </button>
</template>
