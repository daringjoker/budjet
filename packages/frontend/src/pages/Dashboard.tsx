import { trpc } from '../trpc.js'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#a78bfa']

export default function Dashboard() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const summary = trpc.reports.summary.useQuery({ from, to })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from, to })
  const upcoming = trpc.predicted.list.useQuery({ status: 'pending' })

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total In', value: summary.data?.totalIn ?? 0, color: '#34d399' },
          { label: 'Total Out', value: summary.data?.totalOut ?? 0, color: '#f87171' },
          { label: 'Net', value: summary.data?.net ?? 0, color: '#818cf8' },
        ].map(card => (
          <div key={card.label} style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>
              {card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Spend by Category</h2>
          {breakdown.data?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={breakdown.data} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" outerRadius={80}>
                  {breakdown.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#64748b', fontSize: 13 }}>No data yet.</p>}
        </div>

        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Upcoming</h2>
          {upcoming.data?.slice(0, 6).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155', fontSize: 13 }}>
              <span style={{ color: '#94a3b8' }}>{p.predictedDate.toString().slice(0, 10)}</span>
              <span>{p.notes ?? (p.type === 'recurring' ? 'Recurring' : 'Forecast')}</span>
              <span style={{ color: '#f87171' }}>{p.predictedAmount.toLocaleString()}</span>
            </div>
          ))}
          {!upcoming.data?.length && <p style={{ color: '#64748b', fontSize: 13 }}>No upcoming transactions.</p>}
        </div>
      </div>
    </div>
  )
}
