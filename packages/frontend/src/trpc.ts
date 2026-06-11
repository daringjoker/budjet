import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, type TRPCClient } from '@trpc/client'
import type { AppRouter } from '@budjet/backend/trpc'

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>()

export const trpcClient: TRPCClient<AppRouter> = trpc.createClient({
  links: [httpBatchLink({ url: '/trpc' })],
})
