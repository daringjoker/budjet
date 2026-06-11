const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** "15,000 NPR" */
export function formatMoney(n: number, currency = 'NPR'): string {
  return `${nf.format(n)} ${currency}`
}

/** "+15,000 NPR" / "−1,500 NPR" (minus sign U+2212) */
export function formatSignedMoney(n: number, currency = 'NPR'): string {
  const sign = n < 0 ? '−' : '+'
  return `${sign}${nf.format(Math.abs(n))} ${currency}`
}

/** "Jun 10, 2026" */
export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "42%" (max 1 decimal) */
export function formatPercent(n: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)}%`
}
