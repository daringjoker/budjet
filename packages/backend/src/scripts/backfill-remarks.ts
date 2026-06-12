import 'dotenv/config'
import { randomUUID } from 'crypto'
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { transactions, rawEmails } from '@budjet/shared/schema'
import { loadConfig } from '../config/index.js'
import { createDb } from '../db/index.js'
import { LLMPool } from '../llm/pool.js'
import { loadRules, matchRule } from '../pipeline/merchant-rules.js'

/**
 * Re-parse stored raw emails to fill transactions.remarks for rows created
 * before remarks extraction existed. No IMAP needed — bodies are in the DB.
 */
async function main() {
  const config = loadConfig()
  const db = createDb(config.db.url)

  const rows = await db
    .select({
      txnId: transactions.id,
      subject: rawEmails.subject,
      body: rawEmails.bodyText,
      sender: rawEmails.sender,
    })
    .from(transactions)
    .innerJoin(rawEmails, eq(rawEmails.id, transactions.rawEmailId))
    .where(and(isNull(transactions.remarks), isNotNull(transactions.rawEmailId)))

  console.log(`[REMARKS] ${rows.length} transaction(s) missing remarks`)
  if (rows.length === 0) return

  const senderToBank = new Map(config.banks.map(b => [b.sender.toLowerCase(), b.name]))
  const pool = new LLMPool({ workerCount: config.llm.workerThreads, modelPath: config.llm.modelPath })
  const rules = await loadRules(db)

  let done = 0
  let filled = 0
  let tagged = 0
  const t0 = Date.now()
  for (const row of rows) {
    try {
      const parsed = await pool.run({
        jobId: randomUUID(),
        type: 'parse',
        payload: {
          subject: row.subject,
          body: row.body,
          bankName: senderToBank.get(row.sender.toLowerCase()) ?? 'the bank',
        },
      }) as { remarks?: string | null; description?: string }

      if (parsed.remarks) {
        const patch: { remarks: string; merchant?: string } = { remarks: parsed.remarks }
        const rule = matchRule(rules, parsed.remarks, parsed.description ?? '')
        if (rule) {
          patch.merchant = rule.merchant
          tagged++
        }
        await db.update(transactions).set(patch).where(eq(transactions.id, row.txnId))
        filled++
      }
    } catch (err) {
      console.warn('[REMARKS] Failed for txn', row.txnId, err)
    }
    done++
    if (done % 25 === 0 || done === rows.length) {
      const rate = done / ((Date.now() - t0) / 1000)
      const eta = ((rows.length - done) / rate / 60).toFixed(1)
      console.log(`[REMARKS] ${done}/${rows.length} (${rate.toFixed(2)}/s, ~${eta} min left) — ${filled} filled`)
    }
  }
  await pool.shutdown()
  console.log(`[REMARKS] ✓ Done — ${filled}/${rows.length} remarks filled, ${tagged} merchant-tagged`)
}

main().catch(err => {
  console.error('[REMARKS] ✗ Failed:', err)
  process.exit(1)
})
