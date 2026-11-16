<script setup lang="ts">
import StatusMessage from '@/components/StatusMessage.vue'
import { useSecretCheck } from '@/composables/useSecretCheck'

const { status, result, errorMessage, run } = useSecretCheck()
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">Secret check</h2>
    <p class="text-sm text-slate-600">
      Asks a server function whether its secret is set. The value never reaches the browser.
    </p>
    <button
      type="button"
      class="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
      :disabled="status === 'loading'"
      @click="run"
    >
      Run secret check
    </button>
    <StatusMessage v-if="status === 'loading'" tone="loading">Checking…</StatusMessage>
    <StatusMessage v-else-if="status === 'error'" tone="error" @retry="run">
      {{ errorMessage }}
    </StatusMessage>
    <dl
      v-else-if="status === 'ready' && result"
      class="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm"
    >
      <div>
        <dt class="text-slate-500">Found</dt>
        <dd data-testid="secret-found" class="font-medium">{{ result.found ? 'Yes' : 'No' }}</dd>
      </div>
      <div>
        <dt class="text-slate-500">Length</dt>
        <dd data-testid="secret-length" class="font-medium tabular-nums">{{ result.length }}</dd>
      </div>
    </dl>
  </section>
</template>
