import { useState, type FormEvent } from 'react'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { IconPlus } from '../components/icons.js'
import { formatMoney } from '../lib/format.js'

const TYPES = ['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'] as const

const INITIAL_FORM = {
  name: '',
  type: 'bank' as (typeof TYPES)[number],
  currency: 'NPR',
  initialBalance: '0',
  bankName: '',
  emailSender: '',
}

export default function Accounts() {
  const accounts = trpc.accounts.list.useQuery()
  const utils = trpc.useUtils()
  const toast = useToast()
  const [form, setForm] = useState(INITIAL_FORM)
  const [showForm, setShowForm] = useState(false)

  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => {
      toast.success('Account created')
      setForm(INITIAL_FORM)
      setShowForm(false)
      utils.accounts.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    createMutation.mutate({
      name: form.name.trim(),
      type: form.type,
      currency: form.currency,
      initialBalance: parseFloat(form.initialBalance) || 0,
      bankName: form.bankName || undefined,
      emailSender: form.emailSender || undefined,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Accounts</h2>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          <IconPlus size={15} /> Add Account
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <h3 className="card-title">New account</h3>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="acc-name">Name</label>
              <input
                id="acc-name"
                className="input"
                placeholder="e.g. NIC Asia Savings"
                value={form.name}
                onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-type">Type</label>
              <select
                id="acc-type"
                className="select"
                value={form.type}
                onChange={e => setForm(v => ({ ...v, type: e.target.value as (typeof TYPES)[number] }))}
              >
                {TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-currency">Currency</label>
              <input
                id="acc-currency"
                className="input"
                value={form.currency}
                onChange={e => setForm(v => ({ ...v, currency: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-balance">Initial Balance</label>
              <input
                id="acc-balance"
                className="input"
                type="number"
                step="any"
                value={form.initialBalance}
                onChange={e => setForm(v => ({ ...v, initialBalance: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-bank">Bank Name</label>
              <input
                id="acc-bank"
                className="input"
                placeholder="Optional"
                value={form.bankName}
                onChange={e => setForm(v => ({ ...v, bankName: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-sender">Email Sender</label>
              <input
                id="acc-sender"
                className="input"
                placeholder="Optional"
                value={form.emailSender}
                onChange={e => setForm(v => ({ ...v, emailSender: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn btn-primary${createMutation.isPending ? ' is-loading' : ''}`}
              disabled={createMutation.isPending}
            >
              Create Account
            </button>
          </div>
        </form>
      )}

      {accounts.isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={72} count={3} />
        </div>
      ) : accounts.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={accounts.error.message} />
        </div>
      ) : accounts.data?.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {accounts.data.map(a => (
            <div
              key={a.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {a.type} · {a.bankName ?? 'no bank'} · {a.currency}
                </div>
              </div>
              <div className="num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>
                {formatMoney(a.initialBalance, a.currency)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No accounts yet" hint="Add your first account to start tracking" />
        </div>
      )}
    </div>
  )
}
