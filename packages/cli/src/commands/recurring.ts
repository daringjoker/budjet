import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { badge, date, heading, money } from '../lib/format.js'
import { parseId } from '../lib/validate.js'

type TrpcClient = CreateTRPCClient<AppRouter>

type RecurringItem = Awaited<ReturnType<TrpcClient['recurring']['list']['query']>>[number]

function printRow(r: RecurringItem) {
  const chip =
    r.status === 'pending_confirmation'
      ? badge('PENDING', 'yellow')
      : r.status === 'paused'
        ? badge('PAUSED', 'gray')
        : badge('ACTIVE', 'green')
  console.log(
    `  ${chip} ${chalk.bold(r.name)}  ${money(r.amount, r.currency)} / ${r.frequency}  ${chalk.dim(`next ${date(r.nextDueDate)}`)}  ${chalk.dim(`#${r.id}`)}`,
  )
}

export function registerRecurringCommands(program: Command, trpc: TrpcClient) {
  const cmd = program.command('recurring').description('Manage recurring transactions')

  cmd
    .command('list')
    .description('List recurring transactions grouped by status')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const list = await trpc.recurring.list.query()
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2))
        return
      }
      if (!list.length) {
        console.log(chalk.dim('No recurring transactions yet.'))
        return
      }
      const pending = list.filter((r) => r.status === 'pending_confirmation')
      const active = list.filter((r) => r.status === 'active')
      const paused = list.filter((r) => r.status === 'paused')

      if (pending.length) {
        console.log()
        console.log(heading('Pending confirmation'))
        pending.forEach(printRow)
      }
      if (active.length) {
        console.log()
        console.log(heading('Active'))
        active.forEach(printRow)
      }
      if (paused.length) {
        console.log()
        console.log(heading('Paused'))
        paused.forEach(printRow)
      }
    })

  cmd
    .command('confirm <id>')
    .description('Confirm a detected recurring transaction')
    .action(async (id) => {
      const updated = await trpc.recurring.confirm.mutate({ id: parseId(id, 'recurring transaction ID') })
      console.log(chalk.green(`✓ Recurring transaction confirmed: ${chalk.bold(updated.name)}`))
      console.log(chalk.dim(`  ${money(updated.amount, updated.currency)} / ${updated.frequency} · next ${date(updated.nextDueDate)}`))
    })

  cmd
    .command('dismiss <id>')
    .description('Dismiss (delete) a detected recurring transaction')
    .action(async (id) => {
      const parsed = parseId(id, 'recurring transaction ID')
      await trpc.recurring.dismiss.mutate({ id: parsed })
      console.log(chalk.green(`✓ Recurring transaction #${parsed} dismissed`))
    })
}
