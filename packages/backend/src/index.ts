import 'dotenv/config'
import { loadConfig } from './config/index.js'
import { createDb } from './db/index.js'
import { ImapWatcher } from './imap/watcher.js'
import { EmailQueue } from './queue/email-queue.js'
import { LLMPool } from './llm/pool.js'
import { Processor } from './pipeline/processor.js'
import { startTRPCServer } from './trpc/server.js'
import { Scheduler } from './scheduler/index.js'
import { runNightlyForecast } from './scheduler/forecast.js'
import { accounts } from '@budjet/shared/schema'

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
  process.exit(1)
})

async function main() {
  const config = loadConfig()
  const db = createDb(config.db.url)

  // Build known-senders map from config + DB accounts
  const dbAccounts = await db.select().from(accounts)
  const knownSenders = new Map(
    config.banks.map(b => {
      const dbAcct = dbAccounts.find(a => a.emailSender === b.sender)
      return [b.sender.toLowerCase(), { name: b.name, currency: b.currency, accountId: dbAcct?.id }]
    })
  )

  const pool = new LLMPool({ workerCount: config.llm.workerThreads, modelPath: config.llm.modelPath })
  await pool.init()

  const processor = new Processor(db, knownSenders, pool, config.llm.confidenceThreshold)
  const queue = new EmailQueue({ maxSize: 200 })
  const watcher = new ImapWatcher(config.imap)

  queue.consume(email => processor.process(email))
  queue.on('dropped', e => console.warn('[QUEUE] Dropped email:', e.messageId))
  queue.on('error', err => console.error('[QUEUE] Consumer error:', err))

  watcher.on('email', email => queue.push(email))
  watcher.on('error', err => console.error('[IMAP]', err))

  await watcher.connect()
  console.log('[IMAP] Watching inbox via IDLE...')

  const server = startTRPCServer(db, config.server.port)

  const scheduler = new Scheduler()
  scheduler.daily(2, () => runNightlyForecast(db, config.budget.forecastLookbackDays))
  console.log('[SCHEDULER] Nightly forecast scheduled at 02:00')

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[SHUTDOWN] Received ${signal}, shutting down...`)
    try {
      scheduler.stop()
      server.close()
      await watcher.stop()
      await pool.shutdown()
      process.exit(0)
    } catch (err) {
      console.error('[SHUTDOWN] Error during shutdown:', err)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[FATAL] Startup failed:', err)
  process.exit(1)
})
