import { describe, expect, it } from 'vitest'

import { isUnknownAddressError, randomId, toOrderSummary } from '../backend'

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
  it('totals the lines in cents and keeps the order status', () => {
    const summary = toOrderSummary({
      id: 'order-1',
      number: '1001',
      customer_name: 'Bodega La Esquina',
      ordered_on: '2026-11-16',
      status: 'delivered',
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
      status: 'delivered',
    })
  })

  it('keeps the order status and totals an order with no lines as zero', () => {
    const summary = toOrderSummary({
      id: 'order-2',
      number: '1002',
      customer_name: 'Café Miramar',
      ordered_on: '2026-11-17',
      status: 'issued',
      order_lines: [],
    })
    expect(summary.status).toBe('issued')
    expect(summary.totalCents).toBe(0)
  })
})

describe('randomId', () => {
  it('makes a 32-character hex id without crypto.randomUUID (plain http pages lack it)', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const a = randomId()
      expect(a).toMatch(/^[0-9a-f]{32}$/)
      expect(randomId()).not.toBe(a)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
