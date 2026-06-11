import { trpc } from '../trpc.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { formatMoney, formatPercent } from '../lib/format.js'

interface Budget {
  id: number
  name: string
  period: string
}

function BudgetCard({ budget }: { budget: Budget }) {
  const progress = trpc.budgets.progress.useQuery({ id: budget.id })
  const p = progress.data
  const pct = p?.percentUsed ?? 0
  const level = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success'

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>{budget.name}</span>
        <span className="badge badge-muted">{budget.period}</span>
      </div>
      {progress.isLoading ? (
        <Skeleton height={8} count={2} />
      ) : p ? (
        <>
          <div className="progress" style={{ marginBottom: 10 }}>
            <div className={`progress-fill ${level}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Spent {formatMoney(p.spent)}</span>
            <span style={{ color: `var(--${level})`, fontWeight: 600 }}>{formatPercent(pct)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Limit {formatMoney(p.budgetAmount)}</span>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function Budgets() {
  const budgets = trpc.budgets.list.useQuery()

  return (
    <div>
      <div className="toolbar">
        <h2 className="card-title" style={{ marginBottom: 0 }}>Budgets</h2>
      </div>

      {budgets.isLoading ? (
        <div className="grid-2">
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
      ) : budgets.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={budgets.error.message} />
        </div>
      ) : budgets.data?.length ? (
        <div className="grid-2">
          {budgets.data.map(b => (
            <BudgetCard key={b.id} budget={b} />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No budgets yet" hint="Create one with: budjet budgets create" />
        </div>
      )}
    </div>
  )
}
