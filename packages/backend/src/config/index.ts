import { z } from 'zod'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'

const bankSchema = z.object({
  name: z.string(),
  sender: z.string().email(),
  currency: z.string().default('NPR'),
})

const configFileSchema = z.object({
  banks: z.array(bankSchema),
  llm: z.object({
    modelPath: z.string(),
    confidenceThreshold: z.number().min(0).max(1).default(0.85),
    workerThreads: z.number().int().min(1).max(4).default(1),
  }),
  budget: z.object({
    forecastLookbackDays: z.number().int().default(90),
  }),
})

const envSchema = z.object({
  IMAP_HOST: z.string(),
  IMAP_USER: z.string().email(),
  IMAP_PASSWORD: z.string(),
  IMAP_PORT: z.coerce.number().default(993),
  DATABASE_URL: z.string().default('./data/budjet.db'),
  TRPC_PORT: z.coerce.number().default(3000),
  CONFIG_PATH: z.string().optional(),
})

export function loadConfig() {
  const envResult = envSchema.safeParse(process.env)
  if (!envResult.success) {
    throw new Error('Invalid environment variables:\n' + JSON.stringify(envResult.error.format(), null, 2))
  }
  const env = envResult.data

  const configPath = env.CONFIG_PATH ?? resolve(process.cwd(), 'config.json')
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
  const cfgResult = configFileSchema.safeParse(raw)
  if (!cfgResult.success) {
    throw new Error('Invalid config.json:\n' + JSON.stringify(cfgResult.error.format(), null, 2))
  }
  const cfg = cfgResult.data

  // Resolve modelPath relative to config.json's directory
  const configDir = dirname(configPath)
  const resolvedModelPath = resolve(configDir, cfg.llm.modelPath)

  return {
    ...cfg,
    llm: { ...cfg.llm, modelPath: resolvedModelPath },
    imap: {
      host: env.IMAP_HOST,
      user: env.IMAP_USER,
      password: env.IMAP_PASSWORD,
      port: env.IMAP_PORT,
    },
    db: { url: env.DATABASE_URL },
    server: { port: env.TRPC_PORT },
  }
}

export type AppConfig = ReturnType<typeof loadConfig>
