import type { Command } from 'commander'
import type { CreateTRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'
import chalk from 'chalk'
import * as readline from 'readline/promises'

type TrpcClient = CreateTRPCClient<AppRouter>

export function registerReviewCommands(program: Command, trpc: TrpcClient) {
  program.command('review')
    .description('Review low-confidence parsed transactions')
    .action(async () => {
      const list = await trpc.transactions.list.query({ lowConfidenceOnly: true, limit: 20 })
      const lowConf = list.filter(t => t.llmConfidence !== null && t.llmConfidence < 0.85)
      if (!lowConf.length) { console.log(chalk.green('No transactions need review.')); return }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      console.log(chalk.bold(`\n${lowConf.length} transactions need review:\n`))
      try {
        for (const t of lowConf) {
          const dateStr = typeof t.date === 'string' ? t.date.slice(0, 10) : (t.date as Date).toISOString().slice(0, 10)
          console.log(`  ID: ${t.id} | ${dateStr} | ${t.type} ${t.amount} ${t.currency}`)
          console.log(`  Description: ${chalk.yellow(t.description)} (confidence: ${t.llmConfidence?.toFixed(2)})`)
          const newDesc = await rl.question('  New description (Enter to keep): ')
          if (newDesc.trim()) {
            await trpc.transactions.review.mutate({ id: t.id, description: newDesc.trim(), llmConfidence: null })
            console.log(chalk.green('  ✓ Updated\n'))
          } else {
            console.log('  Skipped\n')
          }
        }
      } finally {
        rl.close()
      }
    })
}
