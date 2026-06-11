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
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>()

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

      worker.on('message', (msg: LLMResult) => {
        const pending = this.pending.get(msg.jobId)
        if (!pending) return
        this.pending.delete(msg.jobId)
        if (msg.error) pending.reject(new Error(msg.error))
        else pending.resolve(msg.result)
        this.idle.push(worker)
        this.drain()
      })

      worker.on('error', (err) => {
        for (const [, p] of this.pending) p.reject(err)
        this.pending.clear()
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
      this.pending.set(job.jobId, { resolve, reject })
      worker.postMessage(job)
    }
  }

  async shutdown() {
    await Promise.all(this.workers.map(w => w.terminate()))
  }
}
