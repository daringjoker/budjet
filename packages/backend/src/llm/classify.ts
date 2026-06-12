import type { LlamaContext } from 'node-llama-cpp'
import { LlamaChatSession, LlamaJsonSchemaGrammar } from 'node-llama-cpp'

export const CLASSIFY_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string' as const, enum: ['transaction', 'other'] },
    confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
  },
  required: ['type', 'confidence'],
  additionalProperties: false,
}

export function buildClassifyPrompt(payload: { subject: string; body: string; bankName: string }): string {
  return `You are a financial email classifier for ${payload.bankName}.

Email subject: ${payload.subject}
Email body (first 800 chars): ${payload.body.slice(0, 800)}

Classify this email. Reply with JSON only.
- type: "transaction" if this is a bank transaction notification (debit, credit, transfer, payment)
- type: "other" for anything else (OTP, newsletter, statement, promotional)
- confidence: your confidence score 0.0 to 1.0`
}

export async function classifyEmail(
  context: LlamaContext,
  payload: { subject: string; body: string; bankName: string }
): Promise<{ type: 'transaction' | 'other'; confidence: number }> {
  const llama = context.model.llama
  const grammar = new LlamaJsonSchemaGrammar(llama, CLASSIFY_SCHEMA)
  const sequence = context.getSequence()
  // The context has a finite sequence pool — dispose or the next call throws.
  try {
    const session = new LlamaChatSession({ contextSequence: sequence })
    const response = await session.prompt(buildClassifyPrompt(payload), { grammar, maxTokens: 64 })
    return JSON.parse(response)
  } finally {
    sequence.dispose()
  }
}
