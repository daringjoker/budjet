import { useState } from 'react'
import { trpc } from '../trpc.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#a78bfa']

export default function Reports() {
  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))

  const fromISO = new Date(from).toISOString()
  const toISO = new Date(to).toISOString()

  const summary = trpc.reports.summary.useQuery({ from: fromISO, to: toISO })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from: fromISO, to: toISO })

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
        <span style={{ color: '#64748b' }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {summary.data && [
          { label: 'Total In', value: summary.data.totalIn, color: '#34d399' },
          { label: 'Total Out', value: summary.data.totalOut, color: '#f87171' },
          { label: 'Transactions', value: summary.data.transactionCount, color: '#818cf8' },
        ].map(c => (
          <div key={c.label} style={{ background: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {breakdown.data && breakdown.data.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Spend by Category</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={breakdown.data}>
              <XAxis dataKey="categoryName" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {breakdown.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
