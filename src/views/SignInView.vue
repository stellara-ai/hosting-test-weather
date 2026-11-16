<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import { useSignIn } from '@/composables/useSignIn'

const route = useRoute()
const router = useRouter()

const { step, email, code, pending, errorMessage, requestCode, verifyCode, startOver } = useSignIn(
  () => {
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/account')
  },
)

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base placeholder:text-slate-400 focus:border-sky-600 focus:outline-2 focus:outline-sky-600'
const buttonClass =
  'w-full rounded-lg bg-sky-700 px-4 py-2.5 text-base font-medium text-white hover:bg-sky-800 disabled:opacity-60'
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Sign in</h1>

    <form v-if="step === 'email'" class="space-y-3" @submit.prevent="requestCode">
      <label for="sign-in-email" class="block text-sm font-medium text-slate-700">Email</label>
      <input
        id="sign-in-email"
        v-model="email"
        type="email"
        required
        autocomplete="email"
        placeholder="you@example.com"
        :class="inputClass"
      />
      <button type="submit" :disabled="pending" :class="buttonClass">
        {{ pending ? 'Sending code…' : 'Email me a code' }}
      </button>
    </form>

    <form v-else class="space-y-3" @submit.prevent="verifyCode">
      <p class="text-sm text-slate-600">
        We sent a sign-in code to <span class="font-medium text-slate-900">{{ email }}</span
        >.
      </p>
      <label for="sign-in-code" class="block text-sm font-medium text-slate-700">Code</label>
      <input
        id="sign-in-code"
        v-model="code"
        type="text"
        required
        inputmode="numeric"
        autocomplete="one-time-code"
        placeholder="Code from the email"
        :class="inputClass"
      />
      <button type="submit" :disabled="pending" :class="buttonClass">
        {{ pending ? 'Checking…' : 'Sign in' }}
      </button>
      <button
        type="button"
        class="w-full py-2 text-sm font-medium text-sky-700 underline hover:text-sky-900"
        @click="startOver"
      >
        Use a different email
      </button>
    </form>

    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {{ errorMessage }}
    </p>
  </section>
</template>
