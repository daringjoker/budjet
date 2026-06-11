#!/usr/bin/env node
import { Command } from 'commander'
import { createTRPCClient, httpBatchLink, type CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import { registerAccountsCommands } from './commands/accounts.js'
import { registerTransactionsCommands } from './commands/transactions.js'
import { registerBudgetsCommands } from './commands/budgets.js'
import { registerRecurringCommands } from './commands/recurring.js'
import { registerAnticipateCommands } from './commands/anticipate.js'
import { registerReviewCommands } from './commands/review.js'
import { registerReportCommands } from './commands/report.js'

const BACKEND_URL = process.env.BUDJET_API_URL ?? 'http://localhost:3000'

export const trpc: CreateTRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${BACKEND_URL}/trpc` })],
})

const program = new Command()
  .name('budjet')
  .description('Personal financial management CLI')
  .version('0.0.1')

registerAccountsCommands(program, trpc)
registerTransactionsCommands(program, trpc)
registerBudgetsCommands(program, trpc)
registerRecurringCommands(program, trpc)
registerAnticipateCommands(program, trpc)
registerReviewCommands(program, trpc)
registerReportCommands(program, trpc)

process.on('unhandledRejection', (err) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(chalk.red('Error: ' + msg))
  process.exit(1)
})

program.parse()
