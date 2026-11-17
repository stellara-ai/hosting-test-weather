import { describe, expect, it } from 'vitest'

import { isUnknownAddressError, toOrderSummary } from '../backend'

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

describe('toOrderSummary', () => {
  it('totals the lines in cents and reports whether the order is signed', () => {
    const summary = toOrderSummary({
      id: 'order-1',
      number: '1001',
      customer_name: 'Bodega La Esquina',
      ordered_on: '2026-11-16',
      signature_path: 'tenant/signatures/sample-signature.png',
      order_lines: [
        { quantity: 4, unit_price_cents: 2450 },
        { quantity: 20, unit_price_cents: 325 },
      ],
    })
    expect(summary).toEqual({
      id: 'order-1',
      number: '1001',
      customerName: 'Bodega La Esquina',
      orderedOn: '2026-11-16',
      totalCents: 16300,
      signed: true,
    })
  })

  it('treats an order without a signature as not signed', () => {
    const summary = toOrderSummary({
      id: 'order-2',
      number: '1002',
      customer_name: 'Café Miramar',
      ordered_on: '2026-11-17',
      signature_path: null,
      order_lines: [],
    })
    expect(summary.signed).toBe(false)
    expect(summary.totalCents).toBe(0)
  })
})
