import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { date, heading, money, signedMoney, stripAnsi, table } from '../lib/format.js'
import { parseId } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerReportCommands(program: Command, trpc: TrpcClient) {
  program
    .command('report')
    .description('Financial summary report')
    .option('--period <period>', 'this-month | this-week | YYYY-MM', 'this-month')
    .option('--account <id>', 'Filter by account ID')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const { from, to } = resolvePeriod(opts.period)
      const accountId = opts.account ? parseId(opts.account, 'account ID') : undefined

      const [summary, breakdown] = await Promise.all([
        trpc.reports.summary.query({ from: from.toISOString(), to: to.toISOString(), accountId }),
        trpc.reports.categoryBreakdown.query({ from: from.toISOString(), to: to.toISOString(), accountId }),
      ])

      if (opts.json) {
        console.log(JSON.stringify({ from: date(from), to: date(to), summary, breakdown }, null, 2))
        return
      }

      console.log()
      console.log(heading(`Report ${date(from)} → ${date(to)}`))

      const inStr = chalk.green(signedMoney(summary.totalIn))
      const outStr = chalk.red(signedMoney(-summary.totalOut))
      const netStr = summary.net >= 0 ? chalk.green(signedMoney(summary.net)) : chalk.red(signedMoney(summary.net))
      const width = Math.max(...[inStr, outStr, netStr].map((s) => stripAnsi(s).length))
      const padLeft = (s: string) => ' '.repeat(width - stripAnsi(s).length) + s
      console.log(`In   ${padLeft(inStr)}`)
      console.log(`Out  ${padLeft(outStr)}`)
      console.log(`Net  ${padLeft(netStr)}`)
      console.log(chalk.dim(`${summary.transactionCount} transaction${summary.transactionCount === 1 ? '' : 's'}`))

      if (breakdown.length) {
        const sorted = [...breakdown].sort((a, b) => b.total - a.total)
        const rows = sorted.map((b) => [b.categoryName, money(b.total)])
        console.log()
        console.log(table([['CATEGORY', 'SPENT'], ...rows], { rightAlign: [1] }))
      }
    })
}

function resolvePeriod(period: string): { from: Date; to: Date } {
  const now = new Date()
  if (period === 'this-month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  }
  if (period === 'this-week') {
    const day = now.getDay()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    return { from, to: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 7) }
  }
  // YYYY-MM format
  const [y, m] = period.split('-').map(Number)
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    console.error(chalk.red(`✗ Invalid period format: "${period}". Use this-month, this-week, or YYYY-MM`))
    process.exit(1)
  }
  return {
    from: new Date(y, m - 1, 1),
    to: new Date(y, m, 0),
  }
}
