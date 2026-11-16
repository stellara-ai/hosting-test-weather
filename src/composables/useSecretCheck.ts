import { ref } from 'vue'

import { backend, BackendError, type SecretCheck } from '@/services/backend'

export type SecretCheckStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Asks the secret-check function whether the server-side secret is set. */
export function useSecretCheck() {
  const status = ref<SecretCheckStatus>('idle')
  const result = ref<SecretCheck | null>(null)
  const errorMessage = ref('')

  async function run() {
    status.value = 'loading'
    try {
      result.value = await backend.checkSecret()
      status.value = 'ready'
    } catch (error) {
      result.value = null
      errorMessage.value =
        error instanceof BackendError ? error.message : 'The secret check failed.'
      status.value = 'error'
    }
  }

  return { status, result, errorMessage, run }
}
