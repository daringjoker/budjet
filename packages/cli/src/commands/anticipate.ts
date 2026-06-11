import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerAnticipateCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('anticipate').description('Manage anticipated future expenses')

  cmd.command('add')
    .requiredOption('--account <id>', 'Account ID')
    .requiredOption('--amount <amount>', 'Expected amount')
    .requiredOption('--date <date>', 'Expected date (ISO or YYYY-MM-DD)')
    .option('--note <note>', 'Description')
    .option('--category <id>', 'Category ID')
    .action(async (opts) => {
      const created = await trpc.predicted.createAnticipated.mutate({
        accountId: parseInt(opts.account),
        predictedAmount: parseFloat(opts.amount),
        predictedDate: new Date(opts.date).toISOString(),
        notes: opts.note,
        categoryId: opts.category ? parseInt(opts.category) : undefined,
      })
      console.log(chalk.green(`✓ Anticipated expense added (ID: ${created.id})`))
    })

  cmd.command('list').action(async () => {
    const list = await trpc.predicted.list.query({ status: 'pending' })
    list.forEach(p => {
      const label = p.type === 'anticipated' ? chalk.blue('manual') : p.type === 'recurring' ? chalk.cyan('recurring') : chalk.gray('forecast')
      const dateStr = typeof p.predictedDate === 'string' ? p.predictedDate.slice(0, 10) : (p.predictedDate as Date).toISOString().slice(0, 10)
      console.log(`  [${label}] ${dateStr} — ${p.predictedAmount} | ${p.notes ?? ''}`)
    })
  })
}
