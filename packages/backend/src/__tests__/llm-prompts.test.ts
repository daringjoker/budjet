import { describe, it, expect } from 'vitest'
import { CLASSIFY_SCHEMA, buildClassifyPrompt } from '../llm/classify.js'
import { PARSE_SCHEMA, buildParsePrompt } from '../llm/parse.js'

describe('classify prompt', () => {
  it('buildClassifyPrompt includes subject, body, and bankName', () => {
    const prompt = buildClassifyPrompt({
      subject: 'Transaction Alert',
      body: 'You spent NPR 500 at Coffee Shop',
      bankName: 'NMB Bank',
    })
    expect(prompt).toContain('Transaction Alert')
    expect(prompt).toContain('NPR 500')
    expect(prompt).toContain('NMB Bank')
  })

  it('classify schema has required type and confidence fields', () => {
    expect(CLASSIFY_SCHEMA.properties).toHaveProperty('type')
    expect(CLASSIFY_SCHEMA.properties).toHaveProperty('confidence')
    expect(CLASSIFY_SCHEMA.required).toContain('type')
    expect(CLASSIFY_SCHEMA.required).toContain('confidence')
    expect(CLASSIFY_SCHEMA.additionalProperties).toBe(false)
  })
})

describe('parse prompt', () => {
  it('buildParsePrompt includes bankName and truncates body to 1000 chars', () => {
    const longBody = 'x'.repeat(2000)
    const prompt = buildParsePrompt({ subject: 'Debit Alert', body: longBody, bankName: 'Nabil Bank' })
    expect(prompt).toContain('Nabil Bank')
    expect(prompt).toContain('Debit Alert')
    // Body is truncated to 1000 chars
    expect(prompt.length).toBeLessThan(2000)
  })

  it('parse schema has required amount, type, description, currency, confidence', () => {
    expect(PARSE_SCHEMA.properties).toHaveProperty('amount')
    expect(PARSE_SCHEMA.properties).toHaveProperty('type')
    expect(PARSE_SCHEMA.properties).toHaveProperty('description')
    expect(PARSE_SCHEMA.properties).toHaveProperty('currency')
    expect(PARSE_SCHEMA.properties).toHaveProperty('confidence')
    expect(PARSE_SCHEMA.required).toContain('amount')
    expect(PARSE_SCHEMA.required).not.toContain('date') // date is optional
    expect(PARSE_SCHEMA.additionalProperties).toBe(false)
  })
})
