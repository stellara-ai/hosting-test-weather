<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ search: [city: string] }>()

const input = ref('')

function submit() {
  const city = input.value.trim()
  if (city) emit('search', city)
}
</script>

<template>
  <form class="flex gap-2" role="search" @submit.prevent="submit">
    <label for="city-search" class="sr-only">City</label>
    <input
      id="city-search"
      v-model="input"
      type="search"
      placeholder="City name, e.g. Miami"
      autocomplete="off"
      class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base placeholder:text-slate-400 focus:border-sky-600 focus:outline-2 focus:outline-sky-600"
    />
    <button
      type="submit"
      class="rounded-lg bg-sky-700 px-4 py-2.5 text-base font-medium text-white hover:bg-sky-800"
    >
      Search
    </button>
  </form>
</template>
