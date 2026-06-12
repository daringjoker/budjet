import { describe, it, expect } from 'vitest'
import { adToBs, bsToAd, bsMonthWindow, addBsMonths, daysInBsMonth, formatBsDate, formatBsMonth, bsMonthKey } from '../calendar.js'

describe('BS calendar', () => {
  it('converts known dates both ways', () => {
    // Baishakh 1, 2083 = April 14, 2026 (Nepali new year)
    expect(bsToAd(2083, 1, 1).toDateString()).toBe('Tue Apr 14 2026')
    expect(adToBs(new Date(2026, 3, 14))).toEqual({ year: 2083, month: 1, date: 1 })
    // June 12, 2026 = Jestha 29, 2083
    expect(adToBs(new Date(2026, 5, 12))).toEqual({ year: 2083, month: 2, date: 29 })
  })

  it('computes month windows as half-open AD ranges', () => {
    const w = bsMonthWindow(2083, 2) // Jestha
    expect(w.start.toDateString()).toBe('Fri May 15 2026')
    expect(w.end.toDateString()).toBe('Mon Jun 15 2026') // Asar 1
  })

  it('month arithmetic wraps years', () => {
    expect(addBsMonths(2083, 1, -1)).toEqual({ year: 2082, month: 12 })
    expect(addBsMonths(2082, 12, 1)).toEqual({ year: 2083, month: 1 })
    expect(addBsMonths(2083, 2, -14)).toEqual({ year: 2081, month: 12 })
  })

  it('knows BS month lengths', () => {
    expect(daysInBsMonth(2083, 2)).toBe(31) // Jestha 2083
  })

  it('formats dates and keys', () => {
    const d = new Date(2026, 5, 12)
    expect(formatBsDate(d)).toBe('Jestha 29, 2083')
    expect(formatBsMonth(2083, 2)).toBe('Jestha 2083')
    expect(bsMonthKey(d)).toBe('2083-02')
  })
})
