import { describe, expect, it } from 'vitest'

import type { DeliveryLine } from '../backend'
import { checkModeFor, creditCents, isValidMark, missingUnits, outcomeFor, toExceptions } from '../delivery'

const lines: DeliveryLine[] = [
  { id: 'a', itemCode: 'P BAN', description: 'Bananas', unit: 'case', quantity: 4, unitPriceCents: 2450 },
  { id: 'b', itemCode: 'P CAR', description: 'Carrots', unit: 'bag', quantity: 2, unitPriceCents: 1875 },
  { id: 'c', itemCode: 'B CUB', description: 'Cuban bread', unit: 'loaf', quantity: 20, unitPriceCents: 325 },
]

describe('delivery checklist', () => {
  it('counts everything ticked as all received, with no credit', () => {
    const checked = new Set(['a', 'b', 'c'])
    expect(outcomeFor(lines, checked)).toBe('all_received')
    expect(creditCents(lines, {}, checked)).toBe(0)
    expect(toExceptions(lines, {}, checked)).toEqual([])
  })

  it('credits only the missing units of a short line', () => {
    const marks = { c: { status: 'short' as const, deliveredQuantity: 15, reason: '' } }
    expect(missingUnits(lines[2]!, marks.c)).toBe(5)
    expect(creditCents(lines, marks, new Set(['a', 'b']))).toBe(5 * 325)
  })

  it('credits a refused or damaged line in full', () => {
    const marks = {
      a: { status: 'refused' as const, deliveredQuantity: 0, reason: 'Wrong item' },
      b: { status: 'damaged' as const, deliveredQuantity: 0, reason: '' },
    }
    expect(creditCents(lines, marks, new Set(['c']))).toBe(4 * 2450 + 2 * 1875)
    expect(outcomeFor(lines, new Set(['c']))).toBe('exceptions')
  })

  it('never credits more than was ordered, even with a bad quantity', () => {
    expect(missingUnits(lines[0]!, { status: 'short', deliveredQuantity: -3, reason: '' })).toBe(4)
    expect(missingUnits(lines[0]!, { status: 'short', deliveredQuantity: 99, reason: '' })).toBe(0)
  })

  it('accepts a short line only when part of it arrived', () => {
    expect(isValidMark(lines[0]!, { status: 'short', deliveredQuantity: 3, reason: '' })).toBe(true)
    expect(isValidMark(lines[0]!, { status: 'short', deliveredQuantity: 4, reason: '' })).toBe(false)
    expect(isValidMark(lines[0]!, undefined)).toBe(false)
    expect(isValidMark(lines[0]!, { status: 'refused', deliveredQuantity: 0, reason: '' })).toBe(true)
  })

  it('sends only unticked lines to the server, with delivered quantity for short lines', () => {
    const marks = {
      a: { status: 'short' as const, deliveredQuantity: 3, reason: ' Back order ' },
      b: { status: 'refused' as const, deliveredQuantity: 9, reason: '' },
    }
    expect(toExceptions(lines, marks, new Set(['c']))).toEqual([
      { orderLineId: 'a', status: 'short', deliveredQuantity: 3, reason: 'Back order' },
      { orderLineId: 'b', status: 'refused', deliveredQuantity: 0, reason: '' },
    ])
  })

  it('records whether select-all was used', () => {
    expect(checkModeFor(true)).toBe('select_all')
    expect(checkModeFor(false)).toBe('one_by_one')
  })
})
