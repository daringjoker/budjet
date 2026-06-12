import { router, createCallerFactory } from './trpc.js'
import { accountsRouter } from './routers/accounts.js'
import { transactionsRouter } from './routers/transactions.js'
import { categoriesRouter } from './routers/categories.js'
import { budgetsRouter } from './routers/budgets.js'
import { recurringRouter } from './routers/recurring.js'
import { predictedRouter } from './routers/predicted.js'
import { reportsRouter } from './routers/reports.js'
import { merchantsRouter } from './routers/merchants.js'
import { insightsRouter } from './routers/insights.js'

export const appRouter = router({
  accounts: accountsRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
  budgets: budgetsRouter,
  recurring: recurringRouter,
  predicted: predictedRouter,
  reports: reportsRouter,
  merchants: merchantsRouter,
  insights: insightsRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
