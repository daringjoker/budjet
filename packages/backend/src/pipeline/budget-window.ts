import { adToBs, bsMonthWindow, bsToAd } from '@budjet/shared'

interface BudgetLike {
  period: string
  calendar?: string | null
  startDate: Date
  endDate: Date | null
}

/**
 * The active window for a budget at `now`, honoring the budget's calendar
 * ('bs' periods follow Bikram Sambat months/years). Half-open: [start, end).
 */
export function getBudgetWindow(budget: BudgetLike, now: Date): { windowStart: Date; windowEnd: Date } {
  const bs = budget.calendar === 'bs'

  switch (budget.period) {
    case 'monthly': {
      if (bs) {
        const cur = adToBs(now)
        const { start, end } = bsMonthWindow(cur.year, cur.month)
        return { windowStart: start, windowEnd: end }
      }
      return {
        windowStart: new Date(now.getFullYear(), now.getMonth(), 1),
        windowEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      }
    }
    case 'weekly': {
      const day = now.getDay()
      return {
        windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day),
        windowEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 7),
      }
    }
    case 'yearly': {
      if (bs) {
        const cur = adToBs(now)
        return {
          windowStart: bsToAd(cur.year, 1, 1),
          windowEnd: bsToAd(cur.year + 1, 1, 1),
        }
      }
      return {
        windowStart: new Date(now.getFullYear(), 0, 1),
        windowEnd: new Date(now.getFullYear() + 1, 0, 1),
      }
    }
    default:
      return {
        windowStart: budget.startDate,
        windowEnd: budget.endDate ?? now,
      }
  }
}
