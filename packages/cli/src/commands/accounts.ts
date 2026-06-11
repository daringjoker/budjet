import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { table } from '../lib/format.js'
import { parseAmount } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerAccountsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('accounts').description('Manage accounts')

  cmd
    .command('list')
    .description('List all accounts')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const list = await trpc.accounts.list.query()
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2))
        return
      }
      if (!list.length) {
        console.log(chalk.dim('No accounts yet — add one with `budjet accounts add`'))
        return
      }
      const hasBank = list.some((a) => a.bankName)
      const header = ['ID', 'NAME', 'TYPE', 'CURRENCY', ...(hasBank ? ['BANK'] : [])]
      const rows = list.map((a) => [
        chalk.dim(String(a.id)),
        a.name,
        a.type,
        a.currency,
        ...(hasBank ? [a.bankName ?? chalk.dim('—')] : []),
      ])
      console.log()
      console.log(table([header, ...rows]))
    })

  cmd
    .command('add')
    .description('Add a new account')
    .requiredOption('--name <name>', 'Account name')
    .requiredOption('--type <type>', 'Account type: bank|cash|debit_card|credit_card|fund|investment')
    .option('--currency <currency>', 'Currency code', 'NPR')
    .option('--bank <bank>', 'Bank name')
    .option('--sender <email>', 'Bank email sender address')
    .option('--balance <balance>', 'Initial balance', '0')
    .action(async (opts) => {
      const created = await trpc.accounts.create.mutate({
        name: opts.name,
        type: opts.type,
        currency: opts.currency,
        bankName: opts.bank,
        emailSender: opts.sender,
        initialBalance: parseAmount(opts.balance, '--balance', { allowZero: true }),
      })
      console.log(chalk.green(`✓ Account created: ${chalk.bold(created.name)}`))
      console.log(chalk.dim(`  id ${created.id} · ${opts.type} · ${opts.currency}`))
    })
}
