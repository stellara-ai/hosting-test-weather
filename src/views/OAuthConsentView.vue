<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import StatusMessage from '@/components/StatusMessage.vue'
import { type AuthorizationRequest, backend, BackendError } from '@/services/backend'
import { useAuthStore } from '@/stores/auth'
import { useTenantStore } from '@/stores/tenant'

// Where Supabase Auth sends a person when an outside app (for example an AI
// agent connecting over MCP) asks to act as them. Stage three, Part F.
// The router makes sure the person is signed in first.
const route = useRoute()
const auth = useAuthStore()
const tenant = useTenantStore()

const status = ref<'loading' | 'ready' | 'deciding' | 'error'>('loading')
const request = ref<AuthorizationRequest | null>(null)
const errorMessage = ref('')

const SCOPE_TEXT: Record<string, string> = {
  openid: 'Confirm who you are',
  email: 'See your email address',
  profile: 'See your basic profile',
  phone: 'See your phone number',
}

function message(error: unknown, fallback: string) {
  return error instanceof BackendError ? error.message : fallback
}

async function load() {
  const id = route.query.authorization_id
  if (typeof id !== 'string' || !id) {
    errorMessage.value = 'This link is missing its request. Start the connection again from the app.'
    status.value = 'error'
    return
  }
  try {
    const result = await backend.getAuthorizationRequest(id)
    if ('redirectUrl' in result) {
      // Already approved before: go straight back to the app.
      window.location.assign(result.redirectUrl)
      return
    }
    request.value = result
    status.value = 'ready'
  } catch (error) {
    errorMessage.value = message(error, 'This request could not be loaded.')
    status.value = 'error'
  }
}

async function decide(approve: boolean) {
  if (!request.value) return
  status.value = 'deciding'
  try {
    window.location.assign(await backend.decideAuthorization(request.value.id, approve))
  } catch (error) {
    errorMessage.value = message(error, 'Your answer could not be saved.')
    status.value = 'error'
  }
}

onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-md space-y-5">
    <h1 class="text-2xl font-semibold">Connect an app</h1>

    <StatusMessage v-if="status === 'loading'" tone="loading">Loading the request…</StatusMessage>
    <StatusMessage v-else-if="status === 'error'" tone="error" @retry="load">
      {{ errorMessage }}
    </StatusMessage>

    <template v-else-if="request">
      <p class="text-base">
        <span class="font-semibold">{{ request.clientName || 'An app' }}</span>
        wants to act as you,
        <span class="font-medium">{{ auth.user?.email }}</span>.
      </p>

      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>If you allow it, it can:</p>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Read your business's orders
            <template v-if="tenant.tenant">({{ tenant.tenant.name }})</template>, the same ones you
            can see here. It cannot change anything.
          </li>
          <li v-for="scope in request.scopes" :key="scope">{{ SCOPE_TEXT[scope] ?? scope }}</li>
        </ul>
        <p class="pt-1 text-slate-600">
          It will be sent back to
          <span class="break-all font-mono text-xs">{{ request.redirectUri }}</span>
        </p>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          class="rounded-lg bg-brand px-5 py-2.5 text-base font-medium text-white hover:brightness-90 disabled:opacity-60"
          :disabled="status === 'deciding'"
          @click="decide(true)"
        >
          Allow
        </button>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          :disabled="status === 'deciding'"
          @click="decide(false)"
        >
          Deny
        </button>
      </div>
    </template>
  </section>
</template>
