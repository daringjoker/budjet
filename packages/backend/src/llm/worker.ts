import { parentPort, workerData } from 'worker_threads'
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar, type LlamaContext } from 'node-llama-cpp'
import { classifyEmail } from './classify.js'
import { parseTransaction } from './parse.js'
import { categorizeTransaction } from './categorize.js'
import type { LLMJob, LLMResult } from './pool.js'

const { modelPath } = workerData as { modelPath: string }

let context: LlamaContext
try {
  const llama = await getLlama()
  const model = await llama.loadModel({ modelPath })
  context = await model.createContext({ contextSize: 4096 })
} catch (err) {
  parentPort?.postMessage({ type: 'init-error', error: String(err) })
  process.exit(1)
}

parentPort?.on('message', async (job: LLMJob) => {
  try {
    let result: unknown
    if (job.type === 'classify') {
      result = await classifyEmail(context, job.payload as { subject: string; body: string; bankName: string })
    } else if (job.type === 'categorize') {
      result = await categorizeTransaction(context, job.payload)
    } else {
      result = await parseTransaction(context, job.payload as { subject: string; body: string; bankName: string })
    }
    const msg: LLMResult = { jobId: job.jobId, result }
    parentPort?.postMessage(msg)
  } catch (err) {
    const msg: LLMResult = { jobId: job.jobId, result: null, error: String(err) }
    parentPort?.postMessage(msg)
  }
})
