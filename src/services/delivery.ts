/**
 * Pure helpers for the delivery screen. The server recalculates everything in
 * record_delivery(); these only drive what the person sees before saving.
 */
import type { CheckMode, DeliveryLine, DeliveryOutcome, LineException, LineProblem } from '@/services/backend'

/** What the receiver said about one line that was not ticked. */
export interface LineMark {
  status: LineProblem
  deliveredQuantity: number
  reason: string
}

/** Units missing from a line, given its mark. */
export function missingUnits(line: DeliveryLine, mark: LineMark): number {
  if (mark.status !== 'short') return line.quantity
  const delivered = Math.min(Math.max(Math.trunc(mark.deliveredQuantity), 0), line.quantity)
  return line.quantity - delivered
}

/** The credit for every unticked line, in cents. */
export function creditCents(lines: DeliveryLine[], marks: Record<string, LineMark>, checked: Set<string>): number {
  return lines.reduce((sum, line) => {
    if (checked.has(line.id)) return sum
    const mark = marks[line.id]
    return mark ? sum + missingUnits(line, mark) * line.unitPriceCents : sum
  }, 0)
}

/** A short line must have arrived in part, but not in full. */
export function isValidMark(line: DeliveryLine, mark: LineMark | undefined): boolean {
  if (!mark) return false
  if (mark.status !== 'short') return true
  return Number.isInteger(mark.deliveredQuantity) && mark.deliveredQuantity >= 0 && mark.deliveredQuantity < line.quantity
}

/** Turns the checklist into what the server expects. */
export function toExceptions(lines: DeliveryLine[], marks: Record<string, LineMark>, checked: Set<string>): LineException[] {
  return lines
    .filter((line) => !checked.has(line.id))
    .map((line) => {
      const mark = marks[line.id] ?? { status: 'refused' as const, deliveredQuantity: 0, reason: '' }
      return {
        orderLineId: line.id,
        status: mark.status,
        deliveredQuantity: mark.status === 'short' ? mark.deliveredQuantity : 0,
        reason: mark.reason.trim(),
      }
    })
}

/** All ticked means everything arrived; anything unticked is an exception. */
export function outcomeFor(lines: DeliveryLine[], checked: Set<string>): DeliveryOutcome {
  return lines.every((line) => checked.has(line.id)) ? 'all_received' : 'exceptions'
}

/** Once "select all" is used, the check counts as select-all even if some lines are unticked after. */
export function checkModeFor(usedSelectAll: boolean): CheckMode {
  return usedSelectAll ? 'select_all' : 'one_by_one'
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatMoney(cents: number): string {
  return currency.format(cents / 100)
}
