import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { badge, date, money, table } from '../lib/format.js'
import { parseAmount, parseId } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerAnticipateCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('anticipate').description('Manage anticipated future expenses')

  cmd
    .command('add')
    .description('Add an anticipated future expense')
    .requiredOption('--account <id>', 'Account ID')
    .requiredOption('--amount <amount>', 'Expected amount')
    .requiredOption('--date <date>', 'Expected date (ISO or YYYY-MM-DD)')
    .option('--note <note>', 'Description')
    .option('--category <id>', 'Category ID')
    .action(async (opts) => {
      const amount = parseAmount(opts.amount, '--amount')
      const created = await trpc.predicted.createAnticipated.mutate({
        accountId: parseId(opts.account, 'account ID'),
        predictedAmount: amount,
        predictedDate: new Date(opts.date).toISOString(),
        notes: opts.note,
        categoryId: opts.category ? parseId(opts.category, 'category ID') : undefined,
      })
      console.log(chalk.green(`✓ Anticipated expense created${opts.note ? `: ${chalk.bold(opts.note)}` : ''}`))
      console.log(chalk.dim(`  id ${created.id} · ${date(opts.date)} · ${money(amount)}`))
    })

  cmd
    .command('list')
    .description('List pending anticipated expenses')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const list = await trpc.predicted.list.query({ status: 'pending' })
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2))
        return
      }
      if (!list.length) {
        console.log(chalk.dim('No anticipated expenses — add one with `budjet anticipate add`'))
        return
      }
      const sorted = [...list].sort(
        (a, b) => new Date(a.predictedDate).getTime() - new Date(b.predictedDate).getTime(),
      )
      const rows = sorted.map((p) => {
        const source =
          p.type === 'anticipated'
            ? badge('manual', 'blue')
            : p.type === 'recurring'
              ? badge('recurring', 'cyan')
              : badge('forecast', 'gray')
        return [date(p.predictedDate), money(p.predictedAmount), source, p.notes ?? chalk.dim('—')]
      })
      console.log()
      console.log(table([['DATE', 'AMOUNT', 'SOURCE', 'DESCRIPTION'], ...rows], { rightAlign: [1] }))
    })
}
