<script setup lang="ts">
import { ref } from 'vue'

import StatusMessage from '@/components/StatusMessage.vue'
import { useNotes } from '@/composables/useNotes'

const { status, notes, errorMessage, saving, saveError, load, add, remove } = useNotes()
const draft = ref('')

async function submit() {
  if (await add(draft.value)) draft.value = ''
}
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">Notes</h2>
    <p class="text-sm text-slate-600">Only you can see the notes you add here.</p>

    <form class="flex gap-2" @submit.prevent="submit">
      <label for="note-body" class="sr-only">New note</label>
      <input
        id="note-body"
        v-model="draft"
        type="text"
        required
        maxlength="500"
        placeholder="Write a note"
        class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base placeholder:text-slate-400 focus:border-sky-600 focus:outline-2 focus:outline-sky-600"
      />
      <button
        type="submit"
        :disabled="saving || status === 'loading' || status === 'error'"
        class="rounded-lg bg-sky-700 px-4 py-2.5 text-base font-medium text-white hover:bg-sky-800 disabled:opacity-60"
      >
        Add
      </button>
    </form>
    <p v-if="saveError" role="alert" class="text-sm text-red-800">{{ saveError }}</p>

    <StatusMessage v-if="status === 'loading'" tone="loading">Loading your notes…</StatusMessage>
    <StatusMessage v-else-if="status === 'error'" tone="error" @retry="load">
      {{ errorMessage }}
    </StatusMessage>
    <StatusMessage v-else-if="status === 'empty'" tone="empty">No notes yet.</StatusMessage>
    <ul v-else class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      <li
        v-for="note in notes"
        :key="note.id"
        class="flex items-center justify-between gap-3 px-4 py-2"
      >
        <span class="min-w-0 flex-1 py-2 break-words">{{ note.body }}</span>
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          :disabled="saving"
          :aria-label="`Delete note: ${note.body}`"
          @click="remove(note.id)"
        >
          Delete
        </button>
      </li>
    </ul>
  </section>
</template>
