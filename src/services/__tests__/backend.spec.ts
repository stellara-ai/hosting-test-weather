import { describe, expect, it } from 'vitest'

import { isUnknownAddressError } from '../backend'

describe('isUnknownAddressError', () => {
  it('recognises the refusal Supabase gives for an address with no account', () => {
    expect(isUnknownAddressError({ code: 'otp_disabled' })).toBe(true)
    expect(isUnknownAddressError({ code: 'signup_disabled' })).toBe(true)
  })

  it('does not hide other failures', () => {
    expect(isUnknownAddressError({ code: 'over_email_send_rate_limit' })).toBe(false)
    expect(isUnknownAddressError({})).toBe(false)
  })
})
