import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerBudgetsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('budgets').description('Manage budgets')

  cmd.command('list').action(async () => {
    const list = await trpc.budgets.list.query()
    list.forEach(b => console.log(`  ID: ${b.id} | ${b.name} — ${b.amount} ${b.period}`))
  })

  cmd.command('create')
    .requiredOption('--name <name>')
    .requiredOption('--amount <amount>')
    .requiredOption('--period <period>', 'monthly|weekly|yearly|custom')
    .option('--category <id>', 'Category ID')
    .option('--account <id>', 'Account ID')
    .action(async (opts) => {
      const created = await trpc.budgets.create.mutate({
        name: opts.name,
        amount: parseFloat(opts.amount),
        period: opts.period,
        startDate: new Date().toISOString(),
        categoryId: opts.category ? parseInt(opts.category) : undefined,
        accountId: opts.account ? parseInt(opts.account) : undefined,
      })
      console.log(chalk.green(`✓ Budget created (ID: ${created.id})`))
    })

  cmd.command('progress <id>').action(async (id) => {
    const p = await trpc.budgets.progress.query({ id: parseInt(id) })
    const bar = '█'.repeat(Math.round(p.percentUsed / 5)) + '░'.repeat(20 - Math.round(p.percentUsed / 5))
    const color = p.percentUsed >= 100 ? chalk.red : p.percentUsed >= 80 ? chalk.yellow : chalk.green
    console.log(`\n${p.budgetName}`)
    console.log(`  ${color(bar)} ${p.percentUsed}%`)
    console.log(`  Spent: ${p.spent} / ${p.budgetAmount} — Remaining: ${color(String(p.remaining))}`)
  })
}
