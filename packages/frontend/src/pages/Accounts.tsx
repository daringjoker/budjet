import { useState } from 'react'
import { trpc } from '../trpc.js'

const TYPES = ['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'] as const

export default function Accounts() {
  const accounts = trpc.accounts.list.useQuery()
  const utils = trpc.useUtils()
  const create = trpc.accounts.create.useMutation({ onSuccess: () => utils.accounts.list.invalidate() })
  const [form, setForm] = useState({ name: '', type: 'bank' as typeof TYPES[number], currency: 'NPR', initialBalance: '0', bankName: '', emailSender: '' })
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Accounts</h2>
        <button onClick={() => setShowForm(v => !v)} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
          + Add Account
        </button>
      </div>

      {showForm && (
        <form onSubmit={async e => {
          e.preventDefault()
          await create.mutateAsync({
            ...form,
            initialBalance: parseFloat(form.initialBalance),
            emailSender: form.emailSender || undefined,
            bankName: form.bankName || undefined,
          })
          setShowForm(false)
        }}
          style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #334155', display: 'grid', gap: 12 }}>
          {(['name', 'currency', 'initialBalance', 'bankName', 'emailSender'] as const).map(f => (
            <input key={f} placeholder={f} value={form[f]} onChange={e => setForm(v => ({ ...v, [f]: e.target.value }))}
              style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
          ))}
          <select value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as typeof TYPES[number] }))}
            style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer' }}>
            Create
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {accounts.data?.map(a => (
          <div key={a.id} style={{ background: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{a.type} · {a.bankName ?? 'no bank'} · {a.currency}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>{a.initialBalance.toLocaleString()} <span style={{ fontSize: 12 }}>{a.currency}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
