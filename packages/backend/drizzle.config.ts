import type { Config } from 'drizzle-kit'

export default {
  schema: '../shared/src/schema/*.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? './data/budjet.db' },
} satisfies Config
