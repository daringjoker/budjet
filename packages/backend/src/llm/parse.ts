import type { LlamaContext } from 'node-llama-cpp'
import { LlamaChatSession, LlamaJsonSchemaGrammar } from 'node-llama-cpp'

export const PARSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    date: { type: 'string' as const, description: 'ISO 8601 date string' },
    amount: { type: 'number' as const, minimum: 0 },
    type: { type: 'string' as const, enum: ['debit', 'credit'] },
    description: { type: 'string' as const },
    remarks: { type: ['string', 'null'] as any },
    currency: { type: 'string' as const },
    balance_after: { type: ['number', 'null'] as any },
    confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
  },
  required: ['amount', 'type', 'description', 'currency', 'confidence'],
  additionalProperties: false,
}

export interface ParsedTransaction {
  date?: string
  amount: number
  type: 'debit' | 'credit'
  description: string
  remarks?: string | null
  currency: string
  balance_after?: number | null
  confidence: number
}

export function buildParsePrompt(payload: { subject: string; body: string; bankName: string }): string {
  return `You are a financial data extractor for ${payload.bankName}.

Extract the transaction details from this bank notification email.

Email subject: ${payload.subject}
Email body: ${payload.body.slice(0, 6000)}

Extract and reply with JSON only:
- amount: transaction amount as a positive number
- type: "debit" if money left the account, "credit" if money entered
- description: merchant name or transaction description (concise, max 100 chars)
- remarks: the COMPLETE remarks/reference/narration text from the email, copied verbatim and unabridged (including any phone numbers, reference IDs and names); null if the email has none
- currency: currency code (e.g. NPR, USD)
- date: transaction date in ISO 8601 format (use email date if not found in body)
- balance_after: account balance after transaction if mentioned, null otherwise
- confidence: your confidence 0.0 to 1.0 that you extracted these correctly`
}

export async function parseTransaction(
  context: LlamaContext,
  payload: { subject: string; body: string; bankName: string }
): Promise<ParsedTransaction> {
  const llama = context.model.llama
  const grammar = new LlamaJsonSchemaGrammar(llama, PARSE_SCHEMA)
  const sequence = context.getSequence()
  // The context has a finite sequence pool — dispose or the next call throws.
  try {
    const session = new LlamaChatSession({ contextSequence: sequence })
    const response = await session.prompt(buildParsePrompt(payload), { grammar, maxTokens: 512 })
    return JSON.parse(response)
  } finally {
    sequence.dispose()
  }
}
