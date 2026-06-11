import chalk from 'chalk'

/** Matches ANSI escape sequences (colors, styles) so widths can be measured on visible text. */
const ANSI_RE = /\u001b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

/** Format an amount with thousands separators and at most 2 decimals, e.g. "15,000 NPR". */
export function money(amount: number, currency = 'NPR'): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

/**
 * Like money(), but prefixed with "+" or "−" depending on sign.
 * Callers are expected to wrap the result in green/red themselves.
 */
export function signedMoney(amount: number, currency = 'NPR'): string {
  const sign = amount < 0 ? '−' : '+'
  return `${sign}${money(Math.abs(amount), currency)}`
}

/** Format any date-ish value as YYYY-MM-DD. */
export function date(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10)
}

export interface TableOptions {
  /** Zero-based indexes of columns that should be right-aligned (numeric columns). */
  rightAlign?: number[]
}

/**
 * Render a column-aligned plain-text table. The first row is treated as the
 * header (bold, with a dim ─ underline row). ANSI codes are stripped when
 * measuring widths so colored cells align correctly.
 */
export function table(rows: string[][], opts: TableOptions = {}): string {
  if (rows.length === 0) return ''
  const right = new Set(opts.rightAlign ?? [])

  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, stripAnsi(cell).length)
    })
  }

  const pad = (cell: string, i: number): string => {
    const fill = ' '.repeat(Math.max(0, widths[i] - stripAnsi(cell).length))
    return right.has(i) ? fill + cell : cell + fill
  }

  const [header, ...body] = rows
  const lines: string[] = []
  lines.push(header.map((cell, i) => chalk.bold(pad(cell, i))).join('  '))
  lines.push(chalk.dim(widths.map((w) => '─'.repeat(w)).join('──')))
  for (const row of body) {
    lines.push(row.map(pad).join('  ').trimEnd())
  }
  return lines.join('\n')
}

/** Bold text with a dim ─ underline on the next line. */
export function heading(text: string): string {
  return `${chalk.bold(text)}\n${chalk.dim('─'.repeat(stripAnsi(text).length))}`
}

export type BadgeColor = 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'magenta' | 'gray'

/** Small colored status chip, e.g. badge('ACTIVE', 'green') or badge('PENDING', 'yellow'). */
export function badge(text: string, color: BadgeColor): string {
  return chalk[color].bold(text)
}

/**
 * Progress bar using █ / ░, clamped to 0..width.
 * Colored green below 80%, yellow at 80–99%, red at 100% and above.
 */
export function bar(pct: number, width = 24): string {
  const filled = Math.min(Math.max(Math.round((pct / 100) * width), 0), width)
  const raw = '█'.repeat(filled) + '░'.repeat(width - filled)
  const color = pct >= 100 ? chalk.red : pct >= 80 ? chalk.yellow : chalk.green
  return color(raw)
}
