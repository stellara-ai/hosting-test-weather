/**
 * The only module that talks to an email provider. The send-email function
 * depends on the `EmailSender` interface, so the provider (currently Votel)
 * can be replaced by editing this file.
 *
 * Nothing here logs or puts into an error message the sign-in code, the API
 * key or the recipient.
 */

export interface EmailSender {
  sendSignInCode(to: string, code: string): Promise<void>
}

export class EmailSendError extends Error {
  override name = 'EmailSendError'
}

export interface VotelConfig {
  apiHost: string
  apiKey: string
  templateKey: string
}

const SEND_TIMEOUT_MS = 4000

export function createVotelEmailSender(config: VotelConfig): EmailSender {
  return {
    async sendSignInCode(to, code) {
      let response: Response
      try {
        response = await fetch(new URL('/api/emails/send', config.apiHost), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
          body: JSON.stringify({
            template_key: config.templateKey,
            recipient: { email: to },
            variables: { code },
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
      } catch {
        throw new EmailSendError('Could not reach the Votel email API.')
      }
      if (response.status === 401 || response.status === 403) {
        throw new EmailSendError(
          `Votel refused the API key (status ${response.status}). Check VOTEL_API_KEY.`,
        )
      }
      if (!response.ok) {
        throw new EmailSendError(`Votel did not accept the email (status ${response.status}).`)
      }
    },
  }
}

/** Builds the sender from the function's secrets. `readEnv` is `Deno.env.get` in production. */
export function createEmailSender(readEnv: (name: string) => string | undefined): EmailSender {
  const required = (name: string): string => {
    const value = readEnv(name)
    if (!value) throw new EmailSendError(`The ${name} secret is not set.`)
    return value
  }
  return createVotelEmailSender({
    apiHost: required('VOTEL_API_HOST'),
    apiKey: required('VOTEL_API_KEY'),
    templateKey: required('VOTEL_OTP_TEMPLATE_KEY'),
  })
}
