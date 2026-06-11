import { Worker } from 'worker_threads'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

export interface LLMJob {
  jobId: string
  type: 'classify' | 'parse'
  payload: {
    subject: string
    body: string
    bankName: string
  }
}

export interface LLMResult {
  jobId: string
  result: unknown
  error?: string
}

type WorkerFactory = (path: string, options: object) => Worker

export class LLMPool {
  private workers: Worker[] = []
  private queue: Array<{ job: LLMJob; resolve: (r: unknown) => void; reject: (e: Error) => void }> = []
  private idle: Worker[] = []
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void; worker: Worker }>()
  private degraded = false
  private shuttingDown = false

  constructor(
    private readonly cfg: { workerCount: number; modelPath: string },
    private readonly factory?: WorkerFactory
  ) {}

  async init() {
    const workerPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'worker.js'
    )
    for (let i = 0; i < this.cfg.workerCount; i++) {
      const worker = this.factory
        ? this.factory(workerPath, { workerData: { modelPath: this.cfg.modelPath } })
        : new Worker(workerPath, { workerData: { modelPath: this.cfg.modelPath } })

      worker.on('message', (msg: LLMResult | { type: 'init-error'; error: string }) => {
        if ('type' in msg && msg.type === 'init-error') {
          this.degraded = true
          console.error('[LLM] Worker failed to initialize:', msg.error)
          return
        }
        const result = msg as LLMResult
        const pending = this.pending.get(result.jobId)
        if (!pending) return
        this.pending.delete(result.jobId)
        if (result.error) pending.reject(new Error(result.error))
        else pending.resolve(result.result)
        this.idle.push(worker)
        this.drain()
      })

      worker.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err))
        for (const [, p] of this.pending) p.reject(error)
        this.pending.clear()
      })

      worker.on('exit', (code) => {
        // Remove the dead worker so no new jobs are dispatched to it
        this.workers = this.workers.filter(w => w !== worker)
        this.idle = this.idle.filter(w => w !== worker)
        if (this.shuttingDown) return
        console.error(`[LLM] Worker exited with code ${code}`)
        // Reject jobs assigned to this worker so callers don't hang
        const error = new Error(`LLM worker exited with code ${code}`)
        for (const [jobId, p] of this.pending) {
          if (p.worker === worker) {
            this.pending.delete(jobId)
            p.reject(error)
          }
        }
        if (this.workers.length === 0) {
          this.degraded = true
          // No workers left — fail anything still queued
          for (const { reject } of this.queue.splice(0)) reject(error)
        }
      })

      this.workers.push(worker)
      this.idle.push(worker)
    }
  }

  run(job: LLMJob): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject })
      this.drain()
    })
  }

  private drain() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const worker = this.idle.pop()!
      const { job, resolve, reject } = this.queue.shift()!
      this.pending.set(job.jobId, { resolve, reject, worker })
      worker.postMessage(job)
    }
  }

  isDegraded() {
    return this.degraded
  }

  async shutdown() {
    this.shuttingDown = true
    await Promise.all(this.workers.map(w => w.terminate()))
  }
}
