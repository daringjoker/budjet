import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

describe('config loader', () => {
  it('parses valid config.json and env vars', async () => {
    const dir = resolve(tmpdir(), 'budjet-test-' + Math.random().toString(36).slice(2))
    mkdirSync(dir)
    writeFileSync(resolve(dir, 'config.json'), JSON.stringify({
      banks: [{ name: 'Test Bank', sender: 'test@bank.com', currency: 'NPR' }],
      llm: { modelPath: './models/test.gguf', confidenceThreshold: 0.85, workerThreads: 1 },
      budget: { forecastLookbackDays: 90 },
    }))

    process.env.IMAP_HOST = 'imap.gmail.com'
    process.env.IMAP_USER = 'user@gmail.com'
    process.env.IMAP_PASSWORD = 'pass'
    process.env.IMAP_PORT = '993'
    process.env.DATABASE_URL = './data/test.db'
    process.env.TRPC_PORT = '3000'
    process.env.CONFIG_PATH = resolve(dir, 'config.json')

    // Re-import to pick up env vars
    const { loadConfig } = await import('../config/index.js')
    const config = loadConfig()

    expect(config.banks[0].name).toBe('Test Bank')
    expect(config.imap.host).toBe('imap.gmail.com')
    expect(config.llm.confidenceThreshold).toBe(0.85)
    // modelPath should be resolved relative to config.json dir
    expect(config.llm.modelPath).toBe(resolve(dir, 'models/test.gguf'))

    rmSync(dir, { recursive: true })
    delete process.env.CONFIG_PATH
  })
})
