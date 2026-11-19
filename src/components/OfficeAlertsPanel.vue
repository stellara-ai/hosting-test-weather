<script setup lang="ts">
import { onMounted, ref } from 'vue'

import StatusMessage from '@/components/StatusMessage.vue'
import { backend, BackendError, type OfficeAlert } from '@/services/backend'

// Things the office should look at after a delivery: a signer added at the
// door, a delivery signed without checking, or one with problem lines.
// Every member sees them; only admins can mark them handled.
const props = defineProps<{ canResolve: boolean }>()

const status = ref<'loading' | 'ready' | 'error'>('loading')
const alerts = ref<OfficeAlert[]>([])
const errorMessage = ref('')
const busyId = ref<string | null>(null)

const LABELS: Record<OfficeAlert['kind'], string> = {
  new_signer: 'New signer',
  not_checked: 'Not checked',
  exceptions: 'Problems',
}

async function load() {
  status.value = 'loading'
  try {
    alerts.value = await backend.listOfficeAlerts()
    status.value = 'ready'
  } catch (error) {
    errorMessage.value = error instanceof BackendError ? error.message : 'Alerts could not be loaded.'
    status.value = 'error'
  }
}

async function resolve(alert: OfficeAlert) {
  busyId.value = alert.id
  try {
    await backend.resolveOfficeAlert(alert.id)
    alerts.value = alerts.value.filter((a) => a.id !== alert.id)
  } catch (error) {
    errorMessage.value = error instanceof BackendError ? error.message : 'The alert could not be updated.'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">
      Office alerts
      <span v-if="alerts.length" class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
        {{ alerts.length }}
      </span>
    </h2>
    <StatusMessage v-if="status === 'loading'" tone="loading">Loading alerts…</StatusMessage>
    <StatusMessage v-else-if="status === 'error'" tone="error" @retry="load">{{ errorMessage }}</StatusMessage>
    <p v-else-if="alerts.length === 0" class="text-sm text-slate-600">Nothing needs attention.</p>
    <ul v-else class="divide-y divide-slate-100 rounded-xl border border-amber-200 bg-amber-50/50">
      <li v-for="alert in alerts" :key="alert.id" class="flex items-start gap-3 px-4 py-3" data-testid="office-alert">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold tracking-wide text-amber-900 uppercase">{{ LABELS[alert.kind] }}</p>
          <p class="text-sm">{{ alert.message }}</p>
          <p class="text-xs text-slate-500">{{ new Date(alert.createdAt).toLocaleString() }}</p>
        </div>
        <button
          v-if="props.canResolve"
          type="button"
          class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          :disabled="busyId === alert.id"
          @click="resolve(alert)"
        >
          Done
        </button>
      </li>
    </ul>
  </section>
</template>
