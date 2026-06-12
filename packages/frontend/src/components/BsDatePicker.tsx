import { useEffect, useRef, useState } from 'react'
import { adToBs, bsToAd, currentBsMonth, daysInBsMonth, BS_MONTHS } from '@budjet/shared'

/** Local "yyyy-mm-dd" (avoids UTC shift from toISOString) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

interface BsDatePickerProps {
  /** AD "yyyy-mm-dd" or '' */
  value: string
  onChange: (adYmd: string) => void
  label?: string
}

const SELECT_STYLE = { padding: '6px 8px' } as const

/**
 * Compact Bikram Sambat date picker: three selects (Year / Month / Day).
 * Internally BS, emits AD "yyyy-mm-dd" strings via onChange.
 */
export default function BsDatePicker({ value, onChange, label }: BsDatePickerProps) {
  const [bs, setBs] = useState(() => {
    if (value) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return adToBs(d)
    }
    return adToBs(new Date())
  })

  // Resync when the value changes externally (e.g. a preset chip).
  const lastEmitted = useRef(value)
  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) setBs(adToBs(d))
      lastEmitted.current = value
    }
  }, [value])

  const currentBsYear = currentBsMonth().year
  const years: number[] = []
  for (let y = currentBsYear; y >= currentBsYear - 6; y--) years.push(y)

  const maxDay = daysInBsMonth(bs.year, bs.month)

  const apply = (year: number, month: number, date: number) => {
    const clamped = Math.min(date, daysInBsMonth(year, month))
    const next = { year, month, date: clamped }
    setBs(next)
    const adYmd = ymd(bsToAd(next.year, next.month, next.date))
    lastEmitted.current = adYmd
    onChange(adYmd)
  }

  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          className="select"
          style={SELECT_STYLE}
          aria-label={`${label ?? 'BS date'} year`}
          value={bs.year}
          onChange={e => apply(Number(e.target.value), bs.month, bs.date)}
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={SELECT_STYLE}
          aria-label={`${label ?? 'BS date'} month`}
          value={bs.month}
          onChange={e => apply(bs.year, Number(e.target.value), bs.date)}
        >
          {BS_MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={SELECT_STYLE}
          aria-label={`${label ?? 'BS date'} day`}
          value={Math.min(bs.date, maxDay)}
          onChange={e => apply(bs.year, bs.month, Number(e.target.value))}
        >
          {Array.from({ length: maxDay }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
