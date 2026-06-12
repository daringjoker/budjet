import { Worker } from 'worker_threads'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

export interface LLMJob {
  jobId: string
  type: 'classify' | 'parse' | 'categorize'
  payload: {
    subject?: string
    body?: string
    bankName?: string
    description?: string
    txType?: 'debit' | 'credit'
    amount?: number
  }
}

export interface LLMResult {
  jobId: string
  result: unknown
  error?: string
}

type WorkerFactory = (path: string, options: object) => Worker

const DEFAULT_IDLE_TIMEOUT_MS = 120_000

/**
 * On-demand worker pool: the model is loaded when the first job arrives and
 * unloaded again after the pool has been idle for `idleTimeoutMs`, so the
 * process doesn't hold ~2GB of RAM (and warm CPU caches) between emails.
 */
export class LLMPool {
  private workers: Worker[] = []
  private queue: Array<{ job: LLMJob; resolve: (r: unknown) => void; reject: (e: Error) => void }> = []
  private idle: Worker[] = []
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void; worker: Worker }>()
  private degraded = false
  private shuttingDown = false
  private retiring = new Set<Worker>()
  private startPromise: Promise<void> | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private readonly idleTimeoutMs: number

  constructor(
    private readonly cfg: { workerCount: number; modelPath: string; idleTimeoutMs?: number },
    private readonly factory?: WorkerFactory
  ) {
    this.idleTimeoutMs = cfg.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  }

  /** Kept for explicit warm-up (tests, llm-check); run() starts the pool lazily. */
  async init() {
    await this.ensureStarted()
  }

  private ensureStarted(): Promise<void> {
    if (this.shuttingDown) return Promise.reject(new Error('LLM pool is shut down'))
    if (this.workers.length > 0) return Promise.resolve()
    if (this.startPromise) return this.startPromise
    this.startPromise = this.spawnWorkers().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async spawnWorkers() {
    this.degraded = false
    console.log('[LLM] Loading model...')
    // Under tsx the source .ts is executed directly; the worker file must match.
    const workerFile = import.meta.url.endsWith('.ts') ? 'worker.ts' : 'worker.js'
    const workerPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      workerFile
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
        if (this.retiring.delete(worker)) return // deliberate idle unload
        if (this.shuttingDown) return
        if (code !== 0) console.error(`[LLM] Worker exited with code ${code}`)
        // Reject jobs assigned to this worker so callers don't hang
        const error = new Error(`LLM worker exited with code ${code}`)
        for (const [jobId, p] of this.pending) {
          if (p.worker === worker) {
            this.pending.delete(jobId)
            p.reject(error)
          }
        }
        if (this.workers.length === 0 && code !== 0) {
          this.degraded = true
          // No workers left — fail anything still queued
          for (const { reject } of this.queue.splice(0)) reject(error)
        }
      })

      this.workers.push(worker)
      this.idle.push(worker)
    }
  }

  async run(job: LLMJob): Promise<unknown> {
    this.clearIdleTimer()
    await this.ensureStarted()
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
    // All work done — start the idle countdown to unload the model
    if (this.queue.length === 0 && this.pending.size === 0 && this.workers.length > 0) {
      this.scheduleIdleUnload()
    }
  }

  private scheduleIdleUnload() {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (this.queue.length === 0 && this.pending.size === 0 && !this.shuttingDown) {
        void this.unloadWorkers()
      }
    }, this.idleTimeoutMs)
    this.idleTimer.unref()
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private async unloadWorkers() {
    const workers = this.workers
    this.workers = []
    this.idle = []
    workers.forEach(w => this.retiring.add(w))
    await Promise.all(workers.map(w => w.terminate()))
    console.log(`[LLM] Model unloaded after ${Math.round(this.idleTimeoutMs / 1000)}s idle`)
  }

  isDegraded() {
    return this.degraded
  }

  isLoaded() {
    return this.workers.length > 0
  }

  async shutdown() {
    this.shuttingDown = true
    this.clearIdleTimer()
    await Promise.all(this.workers.map(w => w.terminate()))
  }
}
