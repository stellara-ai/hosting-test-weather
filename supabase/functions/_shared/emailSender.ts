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
  fromEmail: string
  fromName: string
}

const SEND_TIMEOUT_MS = 4000

/**
 * Votel's template endpoint (`/api/emails/send`) does not put caller-supplied
 * variables into the email, so the message is built here and sent as raw
 * content through `/api/emails/test`, which accepts a subject, HTML, a sender
 * and a marketing flag.
 */
function signInEmail(code: string): { subject: string; content: string } {
  const digits = code.replace(/[^0-9A-Za-z]/g, '')
  return {
    subject: 'Your sign-in code',
    content: [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;background-color:#ffffff;max-width:480px;margin:0 auto;padding:24px;">',
      '<h1 style="font-size:22px;margin:0 0 16px;">Your sign-in code</h1>',
      '<p style="font-size:16px;margin:0 0 16px;">Enter this code to finish signing in:</p>',
      `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;margin:0 0 16px;">${digits}</p>`,
      '<p style="font-size:14px;color:#374151;margin:0;">The code can be used once and expires in one hour. If you did not ask to sign in, you can ignore this email.</p>',
      '</div>',
    ].join(''),
  }
}

export function createVotelEmailSender(config: VotelConfig): EmailSender {
  return {
    async sendSignInCode(to, code) {
      let response: Response
      try {
        response = await fetch(new URL('/api/emails/test', config.apiHost), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
          body: JSON.stringify({
            recipient_emails: to,
            ...signInEmail(code),
            is_marketing: false,
            from_email: config.fromEmail,
            from_name: config.fromName,
            reply_to: config.fromEmail,
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
    fromEmail: required('VOTEL_FROM_EMAIL'),
    fromName: required('VOTEL_FROM_NAME'),
  })
}
