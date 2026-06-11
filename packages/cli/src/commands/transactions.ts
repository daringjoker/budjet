import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { date, money, signedMoney, table } from '../lib/format.js'
import { parseAmount, parseId } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerTransactionsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('transactions').alias('tx').description('Manage transactions')

  cmd
    .command('list')
    .description('List transactions')
    .option('--account <id>', 'Filter by account ID')
    .option('--from <date>', 'From date (ISO)')
    .option('--to <date>', 'To date (ISO)')
    .option('--limit <n>', 'Max results', '50')
    .option('--low-confidence', 'Only show low-confidence parsed transactions')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const list = await trpc.transactions.list.query({
        accountId: opts.account ? parseId(opts.account, 'account ID') : undefined,
        from: opts.from,
        to: opts.to,
        limit: parseId(opts.limit, 'value for --limit'),
        lowConfidenceOnly: opts.lowConfidence ? true : undefined,
      })
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2))
        return
      }
      if (!list.length) {
        console.log(chalk.dim('No transactions found — add one with `budjet tx add`'))
        return
      }
      const rows = list.map((t) => {
        const amount =
          t.type === 'debit'
            ? chalk.red(signedMoney(-t.amount, t.currency))
            : chalk.green(signedMoney(t.amount, t.currency))
        const conf =
          t.llmConfidence === null
            ? chalk.dim('—')
            : t.llmConfidence < 0.85
              ? chalk.yellow(`⚠ ${t.llmConfidence.toFixed(2)}`)
              : t.llmConfidence.toFixed(2)
        return [date(t.date), t.description, t.type, amount, conf]
      })
      console.log()
      console.log(table([['DATE', 'DESCRIPTION', 'TYPE', 'AMOUNT', 'CONF'], ...rows], { rightAlign: [3] }))
    })

  cmd
    .command('add')
    .description('Add a manual transaction')
    .requiredOption('--account <id>', 'Account ID')
    .requiredOption('--amount <amount>', 'Amount')
    .requiredOption('--type <type>', 'debit or credit')
    .requiredOption('--description <desc>', 'Description')
    .option('--currency <currency>', 'Currency', 'NPR')
    .option('--date <date>', 'Date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    .action(async (opts) => {
      const created = await trpc.transactions.create.mutate({
        accountId: parseId(opts.account, 'account ID'),
        amount: parseAmount(opts.amount, '--amount'),
        type: opts.type,
        description: opts.description,
        currency: opts.currency,
        date: opts.date,
        source: 'manual',
      })
      console.log(chalk.green(`✓ Transaction created: ${chalk.bold(opts.description)}`))
      console.log(chalk.dim(`  id ${created.id} · ${opts.date} · ${opts.type} ${money(Number(opts.amount), opts.currency)}`))
    })
}
