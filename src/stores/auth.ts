import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { backend, type AuthUser } from '@/services/backend'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const ready = ref(false)
  const isSignedIn = computed(() => user.value !== null)

  let initializing: Promise<void> | null = null

  /** Restores the stored session once and keeps `user` in sync afterwards. */
  function init(): Promise<void> {
    initializing ??= (async () => {
      try {
        user.value = await backend.getUser()
        backend.onAuthChange((next) => {
          user.value = next
        })
      } catch {
        user.value = null
      } finally {
        ready.value = true
      }
    })()
    return initializing
  }

  async function requestCode(email: string) {
    await backend.requestCode(email.trim())
  }

  async function verifyCode(email: string, code: string) {
    user.value = await backend.verifyCode(email.trim(), code.trim())
  }

  async function signOut() {
    await backend.signOut()
    user.value = null
  }

  return { user, ready, isSignedIn, init, requestCode, verifyCode, signOut }
})
