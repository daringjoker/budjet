import { trpc } from '../trpc.js'

interface Budget {
  id: number
  name: string
  period: string
}

function BudgetCard({ budget }: { budget: Budget }) {
  const progress = trpc.budgets.progress.useQuery({ id: budget.id })
  const p = progress.data
  const pct = p?.percentUsed ?? 0
  const barColor = pct >= 100 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#34d399'

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>{budget.name}</span>
        <span style={{ color: '#64748b', fontSize: 13 }}>{budget.period}</span>
      </div>
      {p && (
        <>
          <div style={{ height: 8, background: '#334155', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
            <span>Spent: {p.spent.toLocaleString()}</span>
            <span style={{ color: barColor }}>{pct}%</span>
            <span>Limit: {p.budgetAmount.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function Budgets() {
  const budgets = trpc.budgets.list.useQuery()

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Budgets</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {(budgets.data ?? []).map(b => (
          <BudgetCard key={b.id} budget={b} />
        ))}
        {!budgets.data?.length && (
          <p style={{ color: '#64748b' }}>
            No budgets yet. Use the CLI: <code>budjet budgets create</code>
          </p>
        )}
      </div>
    </div>
  )
}
