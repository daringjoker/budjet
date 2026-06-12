import { describe, it, expect, vi } from 'vitest'
import { LLMPool } from '../llm/pool.js'

describe('LLMPool', () => {
  it('dispatches job to idle worker and resolves with result', async () => {
    let messageHandler: Function | null = null
    const mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        if (event === 'message') messageHandler = handler
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }

    const pool = new LLMPool(
      { workerCount: 1, modelPath: '/fake/model.gguf' },
      () => mockWorker as any
    )
    await pool.init()

    const resultPromise = pool.run({
      jobId: 'job-1',
      type: 'classify',
      payload: { subject: 'Test', body: 'Test', bankName: 'Test Bank' },
    })
    // run() awaits the lazy start before enqueueing
    await new Promise(r => setTimeout(r, 0))

    // Simulate worker responding
    expect(mockWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
    messageHandler!({ jobId: 'job-1', result: { type: 'transaction', confidence: 0.9 } })

    const result = await resultPromise
    expect(result).toEqual({ type: 'transaction', confidence: 0.9 })
  })

  it('rejects when worker returns error', async () => {
    let messageHandler: Function | null = null
    const mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        if (event === 'message') messageHandler = handler
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }

    const pool = new LLMPool({ workerCount: 1, modelPath: '/fake/model.gguf' }, () => mockWorker as any)
    await pool.init()

    const resultPromise = pool.run({ jobId: 'job-2', type: 'parse', payload: { subject: 'S', body: 'B', bankName: 'B' } })
    await new Promise(r => setTimeout(r, 0))
    messageHandler!({ jobId: 'job-2', result: null, error: 'LLM failed' })

    await expect(resultPromise).rejects.toThrow('LLM failed')
  })
})
