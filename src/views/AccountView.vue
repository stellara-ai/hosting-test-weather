<script setup lang="ts">
import { useRouter } from 'vue-router'

import NotesPanel from '@/components/NotesPanel.vue'
import SecretCheckPanel from '@/components/SecretCheckPanel.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function signOut() {
  await auth.signOut()
  router.replace({ name: 'sign-in' })
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold">Account</h1>
        <p class="truncate text-sm text-slate-600">Signed in as {{ auth.user?.email }}</p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
    <SecretCheckPanel />
    <NotesPanel />
  </section>
</template>
