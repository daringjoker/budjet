import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { rawEmails, transactions, accounts } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'
import type { LLMPool } from '../llm/pool.js'
import type { EmailEvent } from '../imap/watcher.js'
import { detectRecurring } from './recurring-detector.js'
import { ruleCategory, assignCategory, assignCategoryById } from './categories.js'
import { loadRules, matchRule } from './merchant-rules.js'
import { findTransferCounterpart, linkTransactions } from './transfer-detector.js'

interface BankEntry { name: string; currency: string; accountId?: number }

export class Processor {
  constructor(
    private readonly db: Db,
    private readonly knownSenders: Map<string, BankEntry>,
    private readonly pool: LLMPool,
    private readonly confidenceThreshold: number
  ) {}

  async process(email: EmailEvent) {
    const bank = this.knownSenders.get(email.sender.toLowerCase())

    if (!bank) {
      await this.db.insert(rawEmails).values({
        messageId: email.messageId,
        sender: email.sender,
        subject: email.subject,
        bodyText: email.bodyText,
        receivedAt: email.receivedAt,
        status: 'unknown',
      }).onConflictDoNothing()
      return
    }

    const [savedEmail] = await this.db.insert(rawEmails).values({
      messageId: email.messageId,
      sender: email.sender,
      subject: email.subject,
      bodyText: email.bodyText,
      receivedAt: email.receivedAt,
      status: 'unknown',
      accountId: bank.accountId,
    }).onConflictDoNothing().returning()

    if (!savedEmail) return // duplicate message_id

    try {
      const classification = await this.pool.run({
        jobId: randomUUID(),
        type: 'classify',
        payload: { subject: email.subject, body: email.bodyText, bankName: bank.name },
      }) as { type: string; confidence: number }

      if (classification.type !== 'transaction') {
        await this.db.update(rawEmails).set({ status: 'unknown' }).where(eq(rawEmails.id, savedEmail.id))
        return
      }

      const parsed = await this.pool.run({
        jobId: randomUUID(),
        type: 'parse',
        payload: { subject: email.subject, body: email.bodyText, bankName: bank.name },
      }) as { amount: number; type: string; description: string; remarks?: string | null; currency: string; balance_after?: number | null; confidence: number; date?: string }

      // Zero/negative amounts mean the LLM force-fit a non-transaction notice
      if (!(parsed.amount > 0)) {
        await this.db.update(rawEmails).set({ status: 'unknown' }).where(eq(rawEmails.id, savedEmail.id))
        return
      }

      // Distrust extracted dates far from the email's receive time (the model
      // sometimes picks up unrelated dates, e.g. Bikram Sambat conversions)
      let txDate = parsed.date ? new Date(parsed.date) : email.receivedAt
      const driftMs = email.receivedAt.getTime() - txDate.getTime()
      if (isNaN(txDate.getTime()) || driftMs > 45 * 86_400_000 || driftMs < -2 * 86_400_000) {
        txDate = email.receivedAt
      }

      // User-taught merchant rules take precedence over everything else
      const merchantRule = matchRule(await loadRules(this.db), parsed.remarks, parsed.description)

      const [txn] = await this.db.insert(transactions).values({
        accountId: bank.accountId!,
        date: txDate,
        amount: parsed.amount,
        type: parsed.type as 'debit' | 'credit',
        description: parsed.description,
        remarks: parsed.remarks ?? null,
        merchant: merchantRule?.merchant ?? null,
        currency: parsed.currency,
        balanceAfter: parsed.balance_after ?? null,
        source: 'email',
        rawEmailId: savedEmail.id,
        llmConfidence: parsed.confidence,
        createdAt: new Date(),
      }).returning()

      await this.db.update(rawEmails).set({ status: 'processed' }).where(eq(rawEmails.id, savedEmail.id))

      // Categorize: user merchant rule first, then keyword rules, then LLM.
      // Never let categorization failure fail the whole email.
      let resolvedCategory: string | null = null
      try {
        if (merchantRule?.categoryId != null) {
          await assignCategoryById(this.db, txn.id, merchantRule.categoryId)
        } else {
          let categoryName: string | null = ruleCategory(parsed.description, parsed.type as 'debit' | 'credit')
          if (!categoryName) {
            const res = await this.pool.run({
              jobId: randomUUID(),
              type: 'categorize',
              payload: { description: parsed.description, txType: parsed.type as 'debit' | 'credit', amount: parsed.amount },
            }) as { category?: string } | undefined
            categoryName = res?.category ?? null
          }
          if (categoryName) {
            await assignCategory(this.db, txn.id, categoryName)
            resolvedCategory = categoryName
          }
        }
      } catch (err) {
        console.warn('[PROCESSOR] Categorization failed for txn', txn.id, err)
      }

      // Cash withdrawal → auto-create a credit in the Cash account so the money
      // doesn't disappear from the user's net worth view.
      if (parsed.type === 'debit' && resolvedCategory === 'Cash & ATM') {
        try {
          const [cashAccount] = await this.db.select().from(accounts).where(eq(accounts.type, 'cash'))
          if (cashAccount) {
            const [cashCredit] = await this.db.insert(transactions).values({
              accountId: cashAccount.id,
              date: txDate,
              amount: parsed.amount,
              type: 'credit',
              description: `Cash from ${bank.name}`,
              currency: parsed.currency,
              source: 'email',
              rawEmailId: savedEmail.id,
              createdAt: new Date(),
            }).returning()
            await linkTransactions(this.db, txn.id, cashCredit.id)
          }
        } catch (err) {
          console.warn('[PROCESSOR] Failed to create cash counterpart for txn', txn.id, err)
        }
      }

      // Bank-to-bank transfer → look for a matching counterpart in another account.
      if (resolvedCategory === 'Transfers') {
        try {
          const counterpart = await findTransferCounterpart(this.db, txn)
          if (counterpart) {
            await linkTransactions(this.db, txn.id, counterpart.id)
            console.log(`[PROCESSOR] Linked transfer pair: txn ${txn.id} ↔ ${counterpart.id}`)
          }
        } catch (err) {
          console.warn('[PROCESSOR] Transfer detection failed for txn', txn.id, err)
        }
      }

      if (parsed.confidence >= this.confidenceThreshold) {
        await detectRecurring(this.db, txn)
      }
    } catch (err) {
      console.error('[PROCESSOR] Failed to process email', email.messageId, err)
      await this.db.update(rawEmails).set({ status: 'failed' }).where(eq(rawEmails.id, savedEmail.id))
    }
  }
}
