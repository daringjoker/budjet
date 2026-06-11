import { useState } from 'react'
import { trpc } from '../trpc.js'

export default function Transactions() {
  const [filters, setFilters] = useState({ lowConfidenceOnly: false, limit: 100 })
  const transactions = trpc.transactions.list.useQuery(filters)
  const utils = trpc.useUtils()
  const review = trpc.transactions.review.useMutation({ onSuccess: () => utils.transactions.list.invalidate() })

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={filters.lowConfidenceOnly} onChange={e => setFilters(v => ({ ...v, lowConfidenceOnly: e.target.checked }))} />
          Show low-confidence only
        </label>
      </div>

      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0f172a' }}>
              {['Date', 'Description', 'Type', 'Amount', 'Confidence', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.data?.map(t => {
              const lowConf = t.llmConfidence !== null && t.llmConfidence < 0.85
              return (
                <tr key={t.id} style={{ borderTop: '1px solid #334155', background: lowConf ? '#1c1917' : 'transparent' }}>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{t.date.toString().slice(0, 10)}</td>
                  <td style={{ padding: '12px 16px' }}>{t.description}{lowConf && <span style={{ marginLeft: 6, color: '#fbbf24', fontSize: 11 }}>⚠ review</span>}</td>
                  <td style={{ padding: '12px 16px', color: t.type === 'debit' ? '#f87171' : '#34d399' }}>{t.type}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.amount.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', color: lowConf ? '#fbbf24' : '#64748b' }}>
                    {t.llmConfidence != null ? `${(t.llmConfidence * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {lowConf && (
                      <button onClick={async () => {
                        const desc = prompt('New description:', t.description)
                        if (desc) await review.mutateAsync({ id: t.id, description: desc, llmConfidence: null })
                      }} style={{ fontSize: 11, padding: '4px 10px', background: '#4f46e5', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
                        Fix
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!transactions.data?.length && <p style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No transactions yet.</p>}
      </div>
    </div>
  )
}
