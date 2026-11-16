import { ref } from 'vue'

import { BackendError } from '@/services/backend'
import { useAuthStore } from '@/stores/auth'

/** State for the two-step sign-in form: request a code, then enter it. */
export function useSignIn(onSignedIn: () => void) {
  const auth = useAuthStore()
  const step = ref<'email' | 'code'>('email')
  const email = ref('')
  const code = ref('')
  const pending = ref(false)
  const errorMessage = ref('')

  async function run(action: () => Promise<void>) {
    pending.value = true
    errorMessage.value = ''
    try {
      await action()
    } catch (error) {
      errorMessage.value =
        error instanceof BackendError ? error.message : 'Something went wrong. Please try again.'
    } finally {
      pending.value = false
    }
  }

  function requestCode() {
    return run(async () => {
      await auth.requestCode(email.value)
      code.value = ''
      step.value = 'code'
    })
  }

  function verifyCode() {
    return run(async () => {
      await auth.verifyCode(email.value, code.value)
      onSignedIn()
    })
  }

  function startOver() {
    step.value = 'email'
    code.value = ''
    errorMessage.value = ''
  }

  return { step, email, code, pending, errorMessage, requestCode, verifyCode, startOver }
}
