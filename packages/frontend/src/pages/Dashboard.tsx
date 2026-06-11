import { trpc } from '../trpc.js'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { formatDate, formatMoney, formatSignedMoney } from '../lib/format.js'

const CHART_COLORS = ['#6d7cff', '#2dd4a7', '#fbbf24', '#ff6b7a', '#8b96ab', '#8591ff']

const TOOLTIP_STYLE = {
  background: '#131c2e',
  border: '1px solid #243049',
  borderRadius: 8,
  color: '#e6ebf4',
}

export default function Dashboard() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const summary = trpc.reports.summary.useQuery({ from, to })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from, to })
  const upcoming = trpc.predicted.list.useQuery({ status: 'pending' })

  const net = summary.data?.net ?? 0

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {summary.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={summary.error.message} />
        </div>
      ) : (
        <div className="grid-3">
          <div className="stat-card">
            <div className="stat-label">Total In</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value pos">{formatSignedMoney(summary.data?.totalIn ?? 0)}</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Out</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value neg">{formatSignedMoney(-(summary.data?.totalOut ?? 0))}</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Net</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className={`stat-value ${net >= 0 ? 'pos' : 'neg'}`}>{formatSignedMoney(net)}</div>
            )}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Spend by Category</h2>
          {breakdown.isLoading ? (
            <Skeleton height={200} />
          ) : breakdown.isError ? (
            <EmptyState title="Couldn't load data" hint={breakdown.error.message} />
          ) : breakdown.data?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={breakdown.data}
                  dataKey="total"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  stroke="#131c2e"
                >
                  {breakdown.data.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMoney(Number(v))}
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#e6ebf4' }}
                  labelStyle={{ color: '#e6ebf4' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No spending data yet" hint="Categorized transactions will show up here" />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Upcoming</h2>
          {upcoming.isLoading ? (
            <Skeleton height={20} count={5} />
          ) : upcoming.isError ? (
            <EmptyState title="Couldn't load data" hint={upcoming.error.message} />
          ) : upcoming.data?.length ? (
            upcoming.data.slice(0, 6).map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text-dim)' }}>{formatDate(p.predictedDate)}</span>
                <span>{p.notes ?? (p.type === 'recurring' ? 'Recurring' : 'Forecast')}</span>
                <span className="num" style={{ color: 'var(--danger)' }}>
                  {formatMoney(p.predictedAmount)}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="No upcoming transactions" hint="Predicted transactions will appear here" />
          )}
        </div>
      </div>
    </div>
  )
}
