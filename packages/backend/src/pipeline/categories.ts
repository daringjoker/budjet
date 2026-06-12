import { eq } from 'drizzle-orm'
import { categories, transactionCategories } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'

/** Default category set; colors match the frontend design tokens. */
export const EXPENSE_CATEGORIES = [
  { name: 'Income', color: '#2dd4a7' },
  { name: 'Food & Dining', color: '#fb923c' },
  { name: 'Groceries', color: '#a3e635' },
  { name: 'Transport', color: '#60a5fa' },
  { name: 'Utilities & Bills', color: '#fbbf24' },
  { name: 'Shopping', color: '#f472b6' },
  { name: 'Entertainment', color: '#c084fc' },
  { name: 'Health', color: '#f87171' },
  { name: 'Education', color: '#38bdf8' },
  { name: 'Rent & Housing', color: '#fb7185' },
  { name: 'Transfers', color: '#94a3b8' },
  { name: 'Wallet Top-up', color: '#34d399' },
  { name: 'Cash & ATM', color: '#facc15' },
  { name: 'Fees & Charges', color: '#f97316' },
  { name: 'Other', color: '#8b96ab' },
] as const

export type CategoryName = (typeof EXPENSE_CATEGORIES)[number]['name']

/** Idempotently insert any missing default categories; returns name → id. */
export async function ensureDefaultCategories(db: Db): Promise<Map<string, number>> {
  const existing = await db.select().from(categories)
  const byName = new Map(existing.map(c => [c.name, c.id]))
  for (const cat of EXPENSE_CATEGORIES) {
    if (!byName.has(cat.name)) {
      const [row] = await db.insert(categories).values({ name: cat.name, color: cat.color }).returning()
      byName.set(row.name, row.id)
    }
  }
  return byName
}

/**
 * Deterministic keyword rules — handles the unambiguous Nepali banking
 * patterns without waking the LLM. Returns null when unsure.
 */
export function ruleCategory(description: string, type: 'debit' | 'credit'): CategoryName | null {
  const d = description.toLowerCase().trim()
  if (type === 'credit') {
    if (/salary|sal of|sall|interest|dividend|bonus|\bpay\b/.test(d)) return 'Income'
    // Incoming money from wallets, QR, account refs or plain bank names
    if (/esewa|khalti|ibft|transfer|fbs|fonepay|mpay|fpqr|received from|^a\/c \d/.test(d)) return 'Transfers'
    if (/^[a-z .]*bank( limited?| ltd\.?)?$/.test(d)) return 'Transfers'
    return null
  }
  if (/esewa load|khalti load|wallet load|esewa topup|imepay/.test(d)) return 'Wallet Top-up'
  if (/atm|wdl|withdraw|cash/.test(d)) return 'Cash & ATM'
  if (/self verification|charge|fee\b|sms banking|card issuance|renewal|commission/.test(d)) return 'Fees & Charges'
  if (/rent\b|landlord|housing/.test(d)) return 'Rent & Housing'
  if (/electricity|nea\b|khanepani|water bill|internet|worldlink|vianet|ntc|ncell|topup|recharge card/.test(d)) return 'Utilities & Bills'
  if (/pharmacy|hospital|clinic|medic/.test(d)) return 'Health'
  if (/college|school|tuition|course|exam/.test(d)) return 'Education'
  if (/bhatbhateni|mart\b|supermarket|grocery|dept store|store\b|market\b|tarkari|falful|vegetable|fruit|meat shop|butcher/.test(d)) return 'Groceries'
  if (/dairy|bakery/.test(d)) return 'Food & Dining'
  if (/restaurant|cafe|coffee|kitchen|food|momo|pizza|kfc|burger|bakery|sekuwa|bhojan/.test(d)) return 'Food & Dining'
  if (/pathao|indriver|taxi|bus park|fuel|petrol|nepal oil/.test(d)) return 'Transport'
  if (/netflix|spotify|youtube|prime video|steam|cinema|qfx|movie/.test(d)) return 'Entertainment'
  // Opaque transfer references: bank-to-bank, QR-to-phone-number, own transfers.
  // These carry no merchant signal — calling them Transfers beats LLM guessing.
  if (/^mpay nabil$|fbs:|ibft|fund transfer|transfer to|same bank transfer/.test(d)) return 'Transfers'
  if (/^fpqr|fpqr:\d|,\d{7,}/.test(d) && !/[a-z]{3,} [a-z]{3,}/.test(d.replace(/^mpay |^fpqr /, ''))) return 'Transfers'
  if (/^[a-z .]*bank( limited?| ltd\.?)?$/.test(d)) return 'Transfers'
  return null
}

/** Attach a category to a transaction (idempotent). */
export async function assignCategory(db: Db, transactionId: number, categoryName: string) {
  const [cat] = await db.select().from(categories).where(eq(categories.name, categoryName))
  if (!cat) return
  await db.insert(transactionCategories)
    .values({ transactionId, categoryId: cat.id })
    .onConflictDoNothing()
}

/** Replace a transaction's category with the given id. */
export async function assignCategoryById(db: Db, transactionId: number, categoryId: number) {
  await db.delete(transactionCategories).where(eq(transactionCategories.transactionId, transactionId))
  await db.insert(transactionCategories)
    .values({ transactionId, categoryId })
    .onConflictDoNothing()
}
