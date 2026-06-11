import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerReportCommands(program: Command, trpc: TrpcClient) {
  program.command('report')
    .description('Financial summary report')
    .option('--period <period>', 'this-month | this-week | YYYY-MM', 'this-month')
    .option('--account <id>', 'Filter by account ID')
    .action(async (opts) => {
      const { from, to } = resolvePeriod(opts.period)
      const accountId = opts.account ? parseInt(opts.account) : undefined

      const [summary, breakdown] = await Promise.all([
        trpc.reports.summary.query({ from: from.toISOString(), to: to.toISOString(), accountId }),
        trpc.reports.categoryBreakdown.query({ from: from.toISOString(), to: to.toISOString(), accountId }),
      ])

      console.log(chalk.bold(`\nReport: ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`))
      console.log(`  Total in:  ${chalk.green('+' + summary.totalIn)}`)
      console.log(`  Total out: ${chalk.red('-' + summary.totalOut)}`)
      console.log(`  Net:       ${summary.net >= 0 ? chalk.green('+' + summary.net) : chalk.red(String(summary.net))}`)
      console.log(`  Transactions: ${summary.transactionCount}`)

      if (breakdown.length) {
        console.log(chalk.bold('\nSpend by category:'))
        breakdown.forEach(b => {
          console.log(`  ${b.categoryName.padEnd(20)} ${String(b.total).padStart(10)}`)
        })
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
    console.error(chalk.red(`Invalid period format: "${period}". Use this-month, this-week, or YYYY-MM`))
    process.exit(1)
  }
  return {
    from: new Date(y, m - 1, 1),
    to: new Date(y, m, 0),
  }
}
