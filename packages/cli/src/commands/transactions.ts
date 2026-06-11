import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerTransactionsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('transactions').alias('tx').description('Manage transactions')

  cmd.command('list')
    .description('List transactions')
    .option('--account <id>', 'Filter by account ID')
    .option('--from <date>', 'From date (ISO)')
    .option('--to <date>', 'To date (ISO)')
    .option('--limit <n>', 'Max results', '50')
    .action(async (opts) => {
      const list = await trpc.transactions.list.query({
        accountId: opts.account ? parseInt(opts.account) : undefined,
        from: opts.from,
        to: opts.to,
        limit: parseInt(opts.limit),
      })
      if (!list.length) { console.log('No transactions found.'); return }
      list.forEach(t => {
        const flag = t.llmConfidence !== null && t.llmConfidence < 0.85 ? chalk.yellow(' ⚠') : ''
        const sign = t.type === 'debit' ? chalk.red('-') : chalk.green('+')
        const dateStr = typeof t.date === 'string' ? t.date.slice(0, 10) : (t.date as Date).toISOString().slice(0, 10)
        console.log(`  ${dateStr} ${sign}${t.amount} ${t.currency} — ${t.description}${flag}`)
      })
    })

  cmd.command('add')
    .description('Add a manual transaction')
    .requiredOption('--account <id>', 'Account ID')
    .requiredOption('--amount <amount>', 'Amount')
    .requiredOption('--type <type>', 'debit or credit')
    .requiredOption('--description <desc>', 'Description')
    .option('--currency <currency>', 'Currency', 'NPR')
    .option('--date <date>', 'Date (ISO)', new Date().toISOString())
    .action(async (opts) => {
      const created = await trpc.transactions.create.mutate({
        accountId: parseInt(opts.account),
        amount: parseFloat(opts.amount),
        type: opts.type,
        description: opts.description,
        currency: opts.currency,
        date: opts.date,
        source: 'manual',
      })
      console.log(chalk.green(`✓ Transaction added (ID: ${created.id})`))
    })
}
