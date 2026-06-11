import 'dotenv/config'
import { ImapFlow, type ImapFlowOptions } from 'imapflow'
import { eq, sql } from 'drizzle-orm'
import { accounts, rawEmails, transactions } from '@budjet/shared/schema'
import { loadConfig } from '../config/index.js'
import { createDb } from '../db/index.js'
import { extractEmailText } from '../imap/extract.js'
import { LLMPool } from '../llm/pool.js'
import { Processor } from '../pipeline/processor.js'
import type { EmailEvent } from '../imap/watcher.js'

const monthsArg = process.argv.find(a => a.startsWith('--months='))
const MONTHS = monthsArg ? parseInt(monthsArg.split('=')[1], 10) : 3

async function main() {
  const config = loadConfig()
  const db = createDb(config.db.url)

  // Ensure ONE account per bank name; multiple senders can map to the same bank
  const senderToAccount = new Map<string, { name: string; currency: string; accountId: number }>()
  for (const bank of config.banks) {
    const existing = await db.select().from(accounts).where(eq(accounts.name, bank.name))
    let account = existing[0]
    if (!account) {
      ;[account] = await db.insert(accounts).values({
        name: bank.name,
        type: 'bank',
        bankName: bank.name,
        emailSender: bank.sender,
        currency: bank.currency,
        initialBalance: 0,
        createdAt: new Date(),
      }).returning()
      console.log(`[SEED] Created account "${bank.name}" (id ${account.id})`)
    }
    senderToAccount.set(bank.sender.toLowerCase(), {
      name: bank.name,
      currency: bank.currency,
      accountId: account.id,
    })
  }

  // Collect matching messages from IMAP first (fast), then run the LLM pipeline
  const since = new Date()
  since.setMonth(since.getMonth() - MONTHS)
  console.log(`[SEED] Searching INBOX for mail since ${since.toISOString().slice(0, 10)}...`)

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: true,
    auth: { user: config.imap.user, pass: config.imap.password },
    logger: false,
  } as ImapFlowOptions)
  await client.connect()
  await client.mailboxOpen('INBOX', { readOnly: true })

  const emails: EmailEvent[] = []
  for (const bank of config.banks) {
    const uids = await client.search({ from: bank.sender, since }, { uid: true })
    const uidList = Array.isArray(uids) ? uids : []
    console.log(`[SEED] ${bank.name} (${bank.sender}): ${uidList.length} message(s)`)
    if (uidList.length === 0) continue
    for await (const msg of client.fetch(
      uidList.join(','),
      { uid: true, envelope: true, source: true },
      { uid: true }
    )) {
      emails.push({
        messageId: msg.envelope?.messageId ?? `uid-${msg.uid}`,
        sender: msg.envelope?.from?.[0]?.address ?? bank.sender,
        subject: msg.envelope?.subject ?? '',
        bodyText: msg.source ? await extractEmailText(msg.source) : '',
        receivedAt: msg.envelope?.date ?? new Date(),
      })
    }
  }
  await client.logout()
  emails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
  console.log(`[SEED] ${emails.length} email(s) fetched. Loading LLM...`)

  if (emails.length === 0) {
    console.log('[SEED] Nothing to process.')
    return
  }

  const pool = new LLMPool({ workerCount: config.llm.workerThreads, modelPath: config.llm.modelPath })
  await pool.init()
  const processor = new Processor(db, senderToAccount, pool, config.llm.confidenceThreshold)

  const t0 = Date.now()
  let done = 0
  for (const email of emails) {
    await processor.process(email)
    done++
    const elapsed = (Date.now() - t0) / 1000
    const rate = done / elapsed
    const etaMin = ((emails.length - done) / rate / 60).toFixed(1)
    console.log(`[SEED] ${done}/${emails.length} processed (${rate.toFixed(2)}/s, ~${etaMin} min left) — ${email.subject.slice(0, 60)}`)
  }
  await pool.shutdown()

  // Summary
  const [{ nTx }] = await db.select({ nTx: sql<number>`count(*)` }).from(transactions)
  const byStatus = await db
    .select({ status: rawEmails.status, n: sql<number>`count(*)` })
    .from(rawEmails)
    .groupBy(rawEmails.status)
  console.log('\n[SEED] ✓ Backfill complete')
  console.log(`[SEED] Raw emails by status: ${byStatus.map(r => `${r.status}=${r.n}`).join(', ')}`)
  console.log(`[SEED] Transactions in DB: ${nTx}`)
}

main().catch(err => {
  console.error('[SEED] ✗ Backfill failed:', err)
  process.exit(1)
})
