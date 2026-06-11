import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerRecurringCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('recurring').description('Manage recurring transactions')

  cmd.command('list').action(async () => {
    const list = await trpc.recurring.list.query()
    if (!list.length) { console.log('No recurring transactions.'); return }
    list.forEach(r => {
      const status = r.status === 'pending_confirmation' ? chalk.yellow('PENDING') : chalk.green('ACTIVE')
      const nextDate = typeof r.nextDueDate === 'string' ? r.nextDueDate.slice(0, 10) : (r.nextDueDate as Date).toISOString().slice(0, 10)
      console.log(`  [${status}] ID: ${r.id} | ${r.name} — ${r.amount} ${r.currency} / ${r.frequency} | Next: ${nextDate}`)
    })
  })

  cmd.command('confirm <id>').action(async (id) => {
    await trpc.recurring.confirm.mutate({ id: parseInt(id) })
    console.log(chalk.green('✓ Confirmed'))
  })

  cmd.command('dismiss <id>').action(async (id) => {
    await trpc.recurring.dismiss.mutate({ id: parseInt(id) })
    console.log(chalk.green('✓ Dismissed'))
  })
}
