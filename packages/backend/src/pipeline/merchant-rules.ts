import { eq, inArray, or, sql } from 'drizzle-orm'
import { merchantRules, transactions, type MerchantRule } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'
import { assignCategoryById } from './categories.js'

/** Case-insensitive substring match against remarks + description. */
export function matchRule(rules: MerchantRule[], remarks: string | null | undefined, description: string): MerchantRule | null {
  const haystack = `${remarks ?? ''}\n${description}`.toLowerCase()
  for (const rule of rules) {
    if (haystack.includes(rule.pattern.toLowerCase())) return rule
  }
  return null
}

export async function loadRules(db: Db): Promise<MerchantRule[]> {
  return db.select().from(merchantRules)
}

/**
 * Apply one rule to all existing transactions whose remarks or description
 * contain the pattern. Sets merchant and (when the rule has one) category.
 * Returns the number of transactions tagged.
 */
export async function applyRuleToExisting(db: Db, rule: MerchantRule): Promise<number> {
  const pat = `%${rule.pattern.toLowerCase()}%`
  const matches = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(or(
      sql`lower(coalesce(${transactions.remarks}, '')) LIKE ${pat}`,
      sql`lower(${transactions.description}) LIKE ${pat}`,
    ))
  const ids = matches.map(m => m.id)
  if (ids.length === 0) return 0

  await db.update(transactions).set({ merchant: rule.merchant }).where(inArray(transactions.id, ids))
  if (rule.categoryId !== null) {
    for (const id of ids) {
      await assignCategoryById(db, id, rule.categoryId)
    }
  }
  return ids.length
}
