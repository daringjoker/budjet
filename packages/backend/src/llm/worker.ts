import { parentPort, workerData } from 'worker_threads'
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } from 'node-llama-cpp'
import { classifyEmail } from './classify.js'
import { parseTransaction } from './parse.js'
import type { LLMJob, LLMResult } from './pool.js'

const { modelPath } = workerData as { modelPath: string }

const llama = await getLlama()
const model = await llama.loadModel({ modelPath })
const context = await model.createContext({ contextSize: 2048 })

parentPort?.on('message', async (job: LLMJob) => {
  try {
    let result: unknown
    if (job.type === 'classify') {
      result = await classifyEmail(context, job.payload)
    } else {
      result = await parseTransaction(context, job.payload)
    }
    const msg: LLMResult = { jobId: job.jobId, result }
    parentPort?.postMessage(msg)
  } catch (err) {
    const msg: LLMResult = { jobId: job.jobId, result: null, error: String(err) }
    parentPort?.postMessage(msg)
  }
})
