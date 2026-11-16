<script setup lang="ts">
defineProps<{ tone: 'loading' | 'empty' | 'error' }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    class="rounded-xl border px-4 py-8 text-center text-sm"
    :class="
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-slate-200 bg-white text-slate-600'
    "
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <span
      v-if="tone === 'loading'"
      class="mx-auto mb-3 block size-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-700"
      aria-hidden="true"
    />
    <p><slot /></p>
    <button
      v-if="tone === 'error'"
      type="button"
      class="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium hover:bg-red-100"
      @click="$emit('retry')"
    >
      Try again
    </button>
  </div>
</template>
