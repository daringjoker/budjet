import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerAccountsCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('accounts').description('Manage accounts')

  cmd.command('list').description('List all accounts').action(async () => {
    const list = await trpc.accounts.list.query()
    if (!list.length) { console.log('No accounts found.'); return }
    console.log(chalk.bold('\nAccounts:'))
    list.forEach(a => {
      console.log(`  ${chalk.cyan(a.name)} (${a.type}) — ${a.currency} — ID: ${a.id}`)
    })
  })

  cmd.command('add')
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
        initialBalance: parseFloat(opts.balance),
      })
      console.log(chalk.green(`✓ Account created: ${created.name} (ID: ${created.id})`))
    })
}
