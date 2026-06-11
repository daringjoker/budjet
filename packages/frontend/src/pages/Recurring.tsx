import { trpc } from '../trpc.js'

export default function Recurring() {
  const recurring = trpc.recurring.list.useQuery()
  const utils = trpc.useUtils()
  const confirm = trpc.recurring.confirm.useMutation({ onSuccess: () => utils.recurring.list.invalidate() })
  const dismiss = trpc.recurring.dismiss.useMutation({ onSuccess: () => utils.recurring.list.invalidate() })

  const pending = recurring.data?.filter(r => r.status === 'pending_confirmation') ?? []
  const active = recurring.data?.filter(r => r.status === 'active') ?? []

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Recurring Transactions</h2>

      {pending.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, color: '#fbbf24', marginBottom: 12 }}>⚠ Pending Confirmation</h3>
          {pending.map(r => (
            <div key={r.id} style={{ background: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #b45309', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{r.amount.toLocaleString()} {r.currency} / {r.frequency}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => confirm.mutate({ id: r.id })} style={{ padding: '6px 14px', background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Confirm</button>
                <button onClick={() => dismiss.mutate({ id: r.id })} style={{ padding: '6px 14px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>Active</h3>
      {active.map(r => (
        <div key={r.id} style={{ background: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{r.amount.toLocaleString()} {r.currency} / {r.frequency} · Next: {r.nextDueDate.toString().slice(0, 10)}</div>
          </div>
        </div>
      ))}
      {!recurring.data?.length && <p style={{ color: '#64748b' }}>No recurring transactions detected yet.</p>}
    </div>
  )
}
