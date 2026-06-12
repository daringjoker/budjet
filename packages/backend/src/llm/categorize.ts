import type { LlamaContext } from 'node-llama-cpp'
import { LlamaChatSession, LlamaJsonSchemaGrammar } from 'node-llama-cpp'
import { EXPENSE_CATEGORIES } from '../pipeline/categories.js'

export const CATEGORIZE_SCHEMA = {
  type: 'object' as const,
  properties: {
    category: { type: 'string' as const, enum: EXPENSE_CATEGORIES.map(c => c.name) },
  },
  required: ['category'],
  additionalProperties: false,
}

export function buildCategorizePrompt(payload: { description?: string; txType?: 'debit' | 'credit'; amount?: number }): string {
  return `You are a personal-finance categorizer for transactions in Nepal.

Transaction: ${payload.txType === 'credit' ? 'money received' : 'money spent'}, amount ${payload.amount}, description: "${payload.description}"

Notes: FPQR/MPAY are QR payments; IBFT is a bank transfer; eSewa/Khalti are wallets.
Categorize ONLY from clear evidence in the description (a recognizable merchant or purpose).
If the description is an opaque reference — codes, account/phone numbers, or just a bank name — answer "Transfers" for transfers or "Other" otherwise. Never guess a specific category like Education or Health without explicit evidence.
Reply with JSON only.`
}

export async function categorizeTransaction(
  context: LlamaContext,
  payload: { description?: string; txType?: 'debit' | 'credit'; amount?: number }
): Promise<{ category: string }> {
  const llama = context.model.llama
  const grammar = new LlamaJsonSchemaGrammar(llama, CATEGORIZE_SCHEMA)
  const sequence = context.getSequence()
  // The context has a finite sequence pool — dispose or the next call throws.
  try {
    const session = new LlamaChatSession({ contextSequence: sequence })
    const response = await session.prompt(buildCategorizePrompt(payload), { grammar, maxTokens: 32 })
    return JSON.parse(response)
  } finally {
    sequence.dispose()
  }
}
