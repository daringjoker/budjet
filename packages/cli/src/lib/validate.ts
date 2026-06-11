import chalk from 'chalk'

export interface ParseAmountOptions {
  /** Allow zero (e.g. an initial balance of 0). Defaults to false. */
  allowZero?: boolean
}

/**
 * Parse a monetary amount from a CLI flag. Prints a friendly red error and
 * exits with code 1 when the value is not a positive number.
 */
export function parseAmount(raw: string, flag: string, opts: ParseAmountOptions = {}): number {
  const n = Number(raw)
  const valid = Number.isFinite(n) && (opts.allowZero ? n >= 0 : n > 0)
  if (!valid) {
    console.error(
      chalk.red(`✗ Invalid value for ${flag}: "${raw}" — expected a positive number (e.g. 1500 or 1500.50)`),
    )
    process.exit(1)
  }
  return n
}

/**
 * Parse a numeric ID (or other positive integer) from a CLI argument.
 * Prints a friendly red error and exits with code 1 on invalid input.
 */
export function parseId(raw: string, what: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    console.error(chalk.red(`✗ Invalid ${what}: "${raw}" — expected a positive integer (e.g. 3)`))
    process.exit(1)
  }
  return n
}
