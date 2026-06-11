import { useState } from 'react'
import { trpc } from '../trpc.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { formatMoney, formatSignedMoney } from '../lib/format.js'

const TOOLTIP_STYLE = {
  background: '#131c2e',
  border: '1px solid #243049',
  borderRadius: 8,
  color: '#e6ebf4',
}

export default function Reports() {
  const now = new Date()
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  )
  const [to, setTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  )

  const fromISO = new Date(from).toISOString()
  const toISO = new Date(to).toISOString()

  const summary = trpc.reports.summary.useQuery({ from: fromISO, to: toISO })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from: fromISO, to: toISO })

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            type="date"
            className="input"
            value={from}
            onChange={e => {
              if (e.target.value) setFrom(e.target.value)
            }}
          />
        </div>
        <span style={{ color: 'var(--text-dim)', alignSelf: 'flex-end', paddingBottom: 8 }}>→</span>
        <div className="field">
          <label htmlFor="report-to">To</label>
          <input
            id="report-to"
            type="date"
            className="input"
            value={to}
            onChange={e => {
              if (e.target.value) setTo(e.target.value)
            }}
          />
        </div>
      </div>

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
              <div className="stat-value neg">
                {formatSignedMoney(-(summary.data?.totalOut ?? 0))}
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Transactions</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value accent">
                {(summary.data?.transactionCount ?? 0).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Spend by Category</h2>
        {breakdown.isLoading ? (
          <Skeleton height={280} />
        ) : breakdown.isError ? (
          <EmptyState title="Couldn't load data" hint={breakdown.error.message} />
        ) : breakdown.data?.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={breakdown.data}>
              <XAxis
                dataKey="categoryName"
                tick={{ fill: '#8b96ab', fontSize: 12 }}
                axisLine={{ stroke: '#243049' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8b96ab', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => formatMoney(Number(v))}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: '#e6ebf4' }}
                labelStyle={{ color: '#e6ebf4' }}
                cursor={{ fill: 'rgba(109, 124, 255, 0.08)' }}
              />
              <Bar dataKey="total" fill="#6d7cff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No data for this period" />
        )}
      </div>
    </div>
  )
}
