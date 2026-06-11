import 'dotenv/config'
import { randomUUID } from 'crypto'
import { loadConfig } from '../config/index.js'
import { LLMPool } from '../llm/pool.js'

const SAMPLE = {
  subject: 'Transaction Alert',
  body: 'Dear Customer, Your account 0123XXXX5678 has been debited by NPR 1,250.00 on 2026-06-10 at BHATBHATENI SUPERMARKET. Available balance: NPR 45,300.50. - NMB Bank',
  bankName: 'NMB Bank',
}

async function main() {
  const config = loadConfig()
  console.log(`[CHECK] Model: ${config.llm.modelPath}`)

  console.log('[CHECK] Loading model (this can take a minute on CPU)...')
  const t0 = Date.now()
  const pool = new LLMPool({ workerCount: 1, modelPath: config.llm.modelPath })
  await pool.init()

  console.log('[CHECK] Running classify on a sample debit alert...')
  const t1 = Date.now()
  const classification = await pool.run({ jobId: randomUUID(), type: 'classify', payload: SAMPLE })
  const t2 = Date.now()
  console.log(`[CHECK] classify (${((t2 - t1) / 1000).toFixed(1)}s):`, JSON.stringify(classification))

  console.log('[CHECK] Running parse on the same email...')
  const parsed = await pool.run({ jobId: randomUUID(), type: 'parse', payload: SAMPLE })
  const t3 = Date.now()
  console.log(`[CHECK] parse (${((t3 - t2) / 1000).toFixed(1)}s):`, JSON.stringify(parsed))

  // Second classify proves sequences are recycled (regression check for the dispose fix)
  const again = await pool.run({ jobId: randomUUID(), type: 'classify', payload: SAMPLE })
  console.log('[CHECK] second classify ok:', JSON.stringify(again))

  await pool.shutdown()
  console.log(`[CHECK] ✓ LLM operational (total ${((Date.now() - t0) / 1000).toFixed(1)}s, model load ${((t1 - t0) / 1000).toFixed(1)}s)`)
}

main().catch(err => {
  console.error('[CHECK] ✗ LLM check failed:', err)
  process.exit(1)
})
