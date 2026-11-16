import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmailSender, createVotelEmailSender, EmailSendError } from '../emailSender.ts'

const config = {
  apiHost: 'https://api.votel.test',
  apiKey: 'sk_test_key',
  fromEmail: 'support@example.com',
  fromName: 'Example App',
}

describe('Votel email sender', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the recipient, sender and an email containing the code, with the API key header', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await createVotelEmailSender(config).sendSignInCode('user@example.com', '123456')

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.votel.test/api/emails/test')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('sk_test_key')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      recipient_emails: 'user@example.com',
      subject: 'Your sign-in code',
      is_marketing: false,
      from_email: 'support@example.com',
      from_name: 'Example App',
    })
    expect(body.content).toContain('123456')
  })

  it('reports a refused API key clearly, without leaking the key, code or recipient', async () => {
    fetchMock.mockResolvedValue(new Response('{"detail":"bad key sk_test_key"}', { status: 401 }))

    const error = await createVotelEmailSender(config)
      .sendSignInCode('user@example.com', '123456')
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(EmailSendError)
    const message = (error as EmailSendError).message
    expect(message).toContain('refused the API key')
    expect(message).not.toContain('sk_test_key')
    expect(message).not.toContain('123456')
    expect(message).not.toContain('user@example.com')
  })

  it('reports other failures with the status only', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(
      createVotelEmailSender(config).sendSignInCode('user@example.com', '123456'),
    ).rejects.toThrow('Votel did not accept the email (status 500).')
  })

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      createVotelEmailSender(config).sendSignInCode('user@example.com', '123456'),
    ).rejects.toThrow('Could not reach the Votel email API.')
  })

  it('names the missing secret when the configuration is incomplete', () => {
    const env: Record<string, string> = { VOTEL_API_HOST: 'https://api.votel.test' }
    expect(() => createEmailSender((name) => env[name])).toThrow(
      'The VOTEL_API_KEY secret is not set.',
    )
  })
})
