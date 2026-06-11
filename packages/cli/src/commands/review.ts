import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import * as readline from 'readline/promises'
import { date, heading, money } from '../lib/format.js'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerReviewCommands(program: Command, trpc: TrpcClient) {
  program
    .command('review')
    .description('Review low-confidence parsed transactions interactively')
    .action(async () => {
      const list = await trpc.transactions.list.query({ lowConfidenceOnly: true, limit: 20 })
      const lowConf = list.filter((t) => t.llmConfidence !== null && t.llmConfidence < 0.85)
      if (!lowConf.length) {
        console.log(chalk.green('✓ No transactions need review.'))
        return
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      console.log()
      console.log(heading(`${lowConf.length} transaction${lowConf.length === 1 ? '' : 's'} need review`))
      console.log()
      try {
        for (const t of lowConf) {
          const amount =
            t.type === 'debit'
              ? chalk.red(`−${money(t.amount, t.currency)}`)
              : chalk.green(`+${money(t.amount, t.currency)}`)
          console.log(`${chalk.dim(`#${t.id}`)}  ${date(t.date)}  ${amount}`)
          console.log(`  ${chalk.dim('description')}  ${chalk.yellow(t.description)}`)
          console.log(`  ${chalk.dim('confidence')}   ${chalk.yellow(`⚠ ${t.llmConfidence?.toFixed(2)}`)}`)
          const newDesc = await rl.question(`  ${chalk.dim('new description (Enter to keep):')} `)
          if (newDesc.trim()) {
            await trpc.transactions.review.mutate({ id: t.id, description: newDesc.trim(), llmConfidence: null })
            console.log(`  ${chalk.green('✓ updated')}\n`)
          } else {
            console.log(`  ${chalk.dim('skipped')}\n`)
          }
        }
      } finally {
        rl.close()
      }
    })
}
