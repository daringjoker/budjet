import { Hono } from 'hono'
import { trpcServer } from '@hono/trpc-server'
import { serve } from '@hono/node-server'
import { appRouter } from './router.js'
import type { Db } from '../db/index.js'

export function startTRPCServer(db: Db, port: number) {
  const app = new Hono()

  app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext: () => ({ db }),
  }))

  app.get('/health', (c) => c.json({ ok: true }))

  serve({ fetch: app.fetch, port }, () => {
    console.log(`tRPC server running on http://localhost:${port}`)
  })
}
