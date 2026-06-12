import { describe, it, expect } from 'vitest'
import { getBudgetWindow } from '../pipeline/budget-window.js'

// June 12, 2026 = Jestha 29, 2083 BS
const NOW = new Date(2026, 5, 12)
const base = { startDate: new Date(2026, 0, 1), endDate: null }

describe('getBudgetWindow', () => {
  it('AD monthly: half-open Gregorian month', () => {
    const w = getBudgetWindow({ ...base, period: 'monthly', calendar: 'ad' }, NOW)
    expect(w.windowStart.toDateString()).toBe('Mon Jun 01 2026')
    expect(w.windowEnd.toDateString()).toBe('Wed Jul 01 2026')
  })

  it('BS monthly: follows the Bikram Sambat month (Jestha 2083)', () => {
    const w = getBudgetWindow({ ...base, period: 'monthly', calendar: 'bs' }, NOW)
    expect(w.windowStart.toDateString()).toBe('Fri May 15 2026') // Jestha 1
    expect(w.windowEnd.toDateString()).toBe('Mon Jun 15 2026') // Asar 1
  })

  it('BS yearly: Baishakh 1 to next Baishakh 1', () => {
    const w = getBudgetWindow({ ...base, period: 'yearly', calendar: 'bs' }, NOW)
    expect(w.windowStart.toDateString()).toBe('Tue Apr 14 2026') // Baishakh 1, 2083
    expect(w.windowEnd.getFullYear()).toBe(2027)
  })

  it('weekly is calendar-agnostic', () => {
    const ad = getBudgetWindow({ ...base, period: 'weekly', calendar: 'ad' }, NOW)
    const bs = getBudgetWindow({ ...base, period: 'weekly', calendar: 'bs' }, NOW)
    expect(ad).toEqual(bs)
  })

  it('custom uses the budget dates', () => {
    const end = new Date(2026, 7, 1)
    const w = getBudgetWindow({ period: 'custom', calendar: 'ad', startDate: base.startDate, endDate: end }, NOW)
    expect(w.windowStart).toEqual(base.startDate)
    expect(w.windowEnd).toEqual(end)
  })
})
