import type { Server } from 'http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { trpcServer } from '@hono/trpc-server'
import { serve } from '@hono/node-server'
import { appRouter } from './router.js'
import type { Db } from '../db/index.js'

export function startTRPCServer(db: Db, port: number): Server {
  const app = new Hono()

  app.use('/trpc/*', cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  }))

  app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext: () => ({ db }),
  }))

  app.get('/health', (c) => c.json({ ok: true }))

  const hostname = process.env.HOST ?? '127.0.0.1'
  return serve({ fetch: app.fetch, port, hostname }, () => {
    console.log(`tRPC server running on http://${hostname}:${port}`)
  }) as Server
}
