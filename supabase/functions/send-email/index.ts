/**
 * Supabase Auth "Send Email" hook. Auth calls this function instead of
 * sending email itself; the function verifies the hook signature and hands
 * the one-time code to the email provider.
 *
 * Logs never contain the code, the recipient or any secret.
 */
import { Webhook } from 'npm:standardwebhooks@1'

import { createEmailSender, EmailSendError } from '../_shared/emailSender.ts'

interface HookPayload {
  user: { email: string }
  email_data: { token: string; email_action_type: string }
}

function failure(status: number, message: string): Response {
  return Response.json({ error: { http_code: status, message } }, { status })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return failure(405, 'Method not allowed')

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!hookSecret) {
    console.error('send-email: the SEND_EMAIL_HOOK_SECRET secret is not set')
    return failure(500, 'The email hook is not configured')
  }

  const body = await req.text()
  let payload: HookPayload
  try {
    const webhook = new Webhook(hookSecret.replace('v1,whsec_', ''))
    payload = webhook.verify(body, Object.fromEntries(req.headers)) as HookPayload
  } catch {
    console.warn('send-email: rejected a request without a valid hook signature')
    return failure(401, 'Invalid hook signature')
  }

  const { token, email_action_type: action } = payload.email_data
  if (!token) {
    console.log(`send-email: action "${action}" carries no code, nothing sent`)
    return Response.json({})
  }

  try {
    await createEmailSender((name) => Deno.env.get(name)).sendSignInCode(payload.user.email, token)
  } catch (error) {
    const reason = error instanceof EmailSendError ? error.message : 'Unexpected error.'
    console.error(`send-email: failed to send for action "${action}": ${reason}`)
    return failure(500, 'The sign-in email could not be sent')
  }

  console.log(`send-email: sent a code for action "${action}"`)
  return Response.json({})
})
