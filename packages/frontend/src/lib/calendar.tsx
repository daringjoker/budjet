import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { BS_MONTHS, formatBsDate } from '@budjet/shared'
import { formatDate } from './format.js'

export type CalendarKind = 'ad' | 'bs'

interface CalendarContextValue {
  calendar: CalendarKind
  setCalendar: (c: CalendarKind) => void
  /** Format a full date in the active calendar (e.g. "Jun 10, 2026" / "Jestha 29, 2083"). */
  fmtDate: (d: string | Date) => string
  /** Format a "YYYY-MM" month key (in the active calendar) for chart ticks, e.g. "Apr 2026" / "Jes 2083". */
  fmtMonthKey: (key: string) => string
}

const STORAGE_KEY = 'budjet:calendar'

function loadCalendar(): CalendarKind {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'bs' ? 'bs' : 'ad'
  } catch {
    return 'ad'
  }
}

const CalendarContext = createContext<CalendarContextValue | null>(null)

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [calendar, setCalendarState] = useState<CalendarKind>(loadCalendar)

  const setCalendar = useCallback((c: CalendarKind) => {
    setCalendarState(c)
    try {
      localStorage.setItem(STORAGE_KEY, c)
    } catch {
      /* ignore */
    }
  }, [])

  const fmtDate = useCallback(
    (d: string | Date): string => {
      if (calendar === 'bs') return formatBsDate(typeof d === 'string' ? new Date(d) : d)
      return formatDate(d)
    },
    [calendar]
  )

  const fmtMonthKey = useCallback(
    (key: string): string => {
      const [y, mo] = key.split('-').map(Number)
      if (!y || !mo) return key
      if (calendar === 'bs') return `${BS_MONTHS[mo - 1]?.slice(0, 3) ?? key} ${y}`
      return new Date(y, mo - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    },
    [calendar]
  )

  const value = useMemo(
    () => ({ calendar, setCalendar, fmtDate, fmtMonthKey }),
    [calendar, setCalendar, fmtDate, fmtMonthKey]
  )

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext)
  if (!ctx) throw new Error('useCalendar must be used within CalendarProvider')
  return ctx
}
