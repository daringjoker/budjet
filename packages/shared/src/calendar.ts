import NepaliDateModule from 'nepali-date-converter'

interface NepaliDateInstance {
  getYear(): number
  /** 0-11 (Baishakh = 0) */
  getMonth(): number
  getDate(): number
  toJsDate(): Date
  format(formatString: string, language?: 'en' | 'np'): string
}
interface NepaliDateCtor {
  new (year: number, monthIndex: number, date: number): NepaliDateInstance
  new (value?: string | number | Date): NepaliDateInstance
  fromAD(date: Date): NepaliDateInstance
}

// The package ships a UMD main: under Node ESM the class arrives wrapped in
// .default, under bundlers (Vite) it is the module itself.
const mod = NepaliDateModule as unknown as { default?: unknown }
const NepaliDate = (mod.default ?? NepaliDateModule) as NepaliDateCtor

export const BS_MONTHS = [
  'Baishakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const

export interface BsDate {
  year: number
  /** 1-12 (Baishakh = 1) */
  month: number
  date: number
}

export function adToBs(d: Date): BsDate {
  const n = NepaliDate.fromAD(d)
  return { year: n.getYear(), month: n.getMonth() + 1, date: n.getDate() }
}

export function bsToAd(year: number, month: number, date: number): Date {
  return new NepaliDate(year, month - 1, date).toJsDate()
}

/** Half-open window [start, end) of a BS month, in AD dates. */
export function bsMonthWindow(year: number, month: number): { start: Date; end: Date } {
  const start = bsToAd(year, month, 1)
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  const end = bsToAd(next.y, next.m, 1)
  return { start, end }
}

export function daysInBsMonth(year: number, month: number): number {
  const { start, end } = bsMonthWindow(year, month)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export function currentBsMonth(now = new Date()): { year: number; month: number } {
  const bs = adToBs(now)
  return { year: bs.year, month: bs.month }
}

export function addBsMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = (year * 12 + (month - 1)) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** "Jestha 29, 2083" */
export function formatBsDate(d: Date): string {
  const bs = adToBs(d)
  return `${BS_MONTHS[bs.month - 1]} ${bs.date}, ${bs.year}`
}

/** "Jestha 2083" from {year, month} */
export function formatBsMonth(year: number, month: number): string {
  return `${BS_MONTHS[month - 1]} ${year}`
}

/** "2083-02" key for a date's BS month (sorts correctly). */
export function bsMonthKey(d: Date): string {
  const bs = adToBs(d)
  return `${bs.year}-${String(bs.month).padStart(2, '0')}`
}
