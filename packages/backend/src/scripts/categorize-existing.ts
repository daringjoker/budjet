import 'dotenv/config'
import { randomUUID } from 'crypto'
import { isNull, sql } from 'drizzle-orm'
import { transactions, transactionCategories } from '@budjet/shared/schema'
import { loadConfig } from '../config/index.js'
import { createDb } from '../db/index.js'
import { LLMPool } from '../llm/pool.js'
import { ensureDefaultCategories, ruleCategory, assignCategory } from '../pipeline/categories.js'

async function main() {
  const config = loadConfig()
  const db = createDb(config.db.url)
  await ensureDefaultCategories(db)

  const uncategorized = await db
    .select({ id: transactions.id, description: transactions.description, type: transactions.type, amount: transactions.amount })
    .from(transactions)
    .leftJoin(transactionCategories, sql`${transactionCategories.transactionId} = ${transactions.id}`)
    .where(isNull(transactionCategories.transactionId))

  console.log(`[CAT] ${uncategorized.length} uncategorized transaction(s)`)
  if (uncategorized.length === 0) return

  // Pass 1: keyword rules (free)
  const needLlm: typeof uncategorized = []
  let ruled = 0
  for (const t of uncategorized) {
    const name = ruleCategory(t.description, t.type as 'debit' | 'credit')
    if (name) {
      await assignCategory(db, t.id, name)
      ruled++
    } else {
      needLlm.push(t)
    }
  }
  console.log(`[CAT] Rules matched ${ruled}; ${needLlm.length} need the LLM`)

  // Pass 2: LLM for the ambiguous rest
  if (needLlm.length > 0) {
    const pool = new LLMPool({ workerCount: config.llm.workerThreads, modelPath: config.llm.modelPath })
    let done = 0
    const t0 = Date.now()
    for (const t of needLlm) {
      try {
        const res = await pool.run({
          jobId: randomUUID(),
          type: 'categorize',
          payload: { description: t.description, txType: t.type as 'debit' | 'credit', amount: t.amount },
        }) as { category?: string }
        if (res?.category) await assignCategory(db, t.id, res.category)
      } catch (err) {
        console.warn('[CAT] LLM failed for txn', t.id, err)
      }
      done++
      if (done % 20 === 0 || done === needLlm.length) {
        const rate = done / ((Date.now() - t0) / 1000)
        console.log(`[CAT] ${done}/${needLlm.length} (${rate.toFixed(2)}/s)`)
      }
    }
    await pool.shutdown()
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactionCategories)
  console.log(`[CAT] ✓ Done — ${Number(n)} transactions categorized`)
}

main().catch(err => {
  console.error('[CAT] ✗ Failed:', err)
  process.exit(1)
})
