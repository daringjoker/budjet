import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { bar, heading, money, table } from '../lib/format.js'
import { parseAmount, parseId } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerBudgetsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('budgets').description('Manage budgets')

  cmd
    .command('list')
    .description('List all budgets')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const list = await trpc.budgets.list.query()
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2))
        return
      }
      if (!list.length) {
        console.log(chalk.dim('No budgets yet — create one with `budjet budgets create`'))
        return
      }
      const rows = list.map((b) => [chalk.dim(String(b.id)), b.name, money(b.amount), b.period])
      console.log()
      console.log(table([['ID', 'NAME', 'LIMIT', 'PERIOD'], ...rows], { rightAlign: [2] }))
    })

  cmd
    .command('create')
    .description('Create a new budget')
    .requiredOption('--name <name>', 'Budget name')
    .requiredOption('--amount <amount>', 'Budget limit amount')
    .requiredOption('--period <period>', 'monthly|weekly|yearly|custom')
    .option('--category <id>', 'Category ID')
    .option('--account <id>', 'Account ID')
    .action(async (opts) => {
      const amount = parseAmount(opts.amount, '--amount')
      const created = await trpc.budgets.create.mutate({
        name: opts.name,
        amount,
        period: opts.period,
        startDate: new Date().toISOString(),
        categoryId: opts.category ? parseId(opts.category, 'category ID') : undefined,
        accountId: opts.account ? parseId(opts.account, 'account ID') : undefined,
      })
      console.log(chalk.green(`✓ Budget created: ${chalk.bold(opts.name)}`))
      console.log(chalk.dim(`  id ${created.id} · ${money(amount)} / ${opts.period}`))
    })

  cmd
    .command('progress <id>')
    .description('Show spending progress for a budget')
    .option('--json', 'Output raw JSON')
    .action(async (id, opts) => {
      const p = await trpc.budgets.progress.query({ id: parseId(id, 'budget ID') })
      if (opts.json) {
        console.log(JSON.stringify(p, null, 2))
        return
      }
      const color = p.percentUsed >= 100 ? chalk.red : p.percentUsed >= 80 ? chalk.yellow : chalk.green
      console.log()
      console.log(heading(p.budgetName))
      console.log(`${bar(p.percentUsed)} ${color(`${p.percentUsed}%`)}`)
      console.log(`Spent ${money(p.spent)} of ${money(p.budgetAmount)} · ${color(money(p.remaining))} remaining`)
    })
}
