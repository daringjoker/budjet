import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import Modal from '../components/ui/Modal.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { IconPlus } from '../components/icons.js'
import { formatMoney, formatSignedMoney } from '../lib/format.js'

const TYPES = ['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'] as const
type AccountType = (typeof TYPES)[number]

/** Row shape used by the cards + modals (subset of accounts.list output). */
interface Account {
  id: number
  name: string
  type: string
  bankName: string | null
  emailSender: string | null
  currency: string
  initialBalance: number
}

function asAccountType(t: string): AccountType {
  return (TYPES as readonly string[]).includes(t) ? (t as AccountType) : 'bank'
}

/* ------------------------------------------------------------------ */
/* Create modal                                                        */
/* ------------------------------------------------------------------ */

const INITIAL_FORM = {
  name: '',
  type: 'bank' as AccountType,
  currency: 'NPR',
  initialBalance: '0',
  bankName: '',
  emailSender: '',
}

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [form, setForm] = useState(INITIAL_FORM)

  const create = trpc.accounts.create.useMutation({
    onSuccess: () => {
      toast.success('Account created')
      utils.accounts.invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(v => ({ ...v, [key]: value }))

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    create.mutate({
      name: form.name.trim(),
      type: form.type,
      currency: form.currency,
      initialBalance: parseFloat(form.initialBalance) || 0,
      bankName: form.bankName.trim() || undefined,
      emailSender: form.emailSender.trim() || undefined,
    })
  }

  return (
    <Modal
      open
      title="New account"
      onClose={() => {
        if (!create.isPending) onClose()
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={create.isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary${create.isPending ? ' is-loading' : ''}`}
            disabled={create.isPending}
            onClick={() => handleSubmit()}
          >
            Create Account
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="acc-name">Name</label>
            <input
              id="acc-name"
              className="input"
              placeholder="e.g. NIC Asia Savings"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="acc-type">Type</label>
            <select
              id="acc-type"
              className="select"
              value={form.type}
              onChange={e => set('type', e.target.value as AccountType)}
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
              onChange={e => set('currency', e.target.value)}
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
              onChange={e => set('initialBalance', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="acc-bank">Bank Name</label>
            <input
              id="acc-bank"
              className="input"
              placeholder="Optional"
              value={form.bankName}
              onChange={e => set('bankName', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="acc-sender">Email Sender</label>
            <input
              id="acc-sender"
              className="input"
              placeholder="Optional"
              value={form.emailSender}
              onChange={e => set('emailSender', e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Edit modal                                                          */
/* ------------------------------------------------------------------ */

function EditAccountModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()

  const [form, setForm] = useState(() => ({
    name: account.name,
    type: asAccountType(account.type),
    bankName: account.bankName ?? '',
    emailSender: account.emailSender ?? '',
    currency: account.currency,
  }))

  const update = trpc.accounts.update.useMutation({
    onSuccess: () => {
      toast.success('Account updated')
      utils.accounts.invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(v => ({ ...v, [key]: value }))

  const handleSave = () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    const emailSender = form.emailSender.trim()
    update.mutate({
      id: account.id,
      name,
      type: form.type,
      bankName: form.bankName.trim() || null,
      currency: form.currency.trim() || 'NPR',
      emailSender: emailSender || null,
    })
  }

  return (
    <Modal
      open
      title="Edit account"
      onClose={() => {
        if (!update.isPending) onClose()
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={update.isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary${update.isPending ? ' is-loading' : ''}`}
            disabled={update.isPending}
            onClick={handleSave}
          >
            Save
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="field">
          <label htmlFor="acc-edit-name">Name</label>
          <input
            id="acc-edit-name"
            className="input"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="acc-edit-type">Type</label>
            <select
              id="acc-edit-type"
              className="select"
              value={form.type}
              onChange={e => set('type', e.target.value as AccountType)}
            >
              {TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acc-edit-currency">Currency</label>
            <input
              id="acc-edit-currency"
              className="input"
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="acc-edit-bank">Bank Name</label>
            <input
              id="acc-edit-bank"
              className="input"
              placeholder="Optional"
              value={form.bankName}
              onChange={e => set('bankName', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="acc-edit-sender">Email Sender</label>
            <input
              id="acc-edit-sender"
              className="input"
              placeholder="Optional"
              value={form.emailSender}
              onChange={e => set('emailSender', e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Set-balance (reconcile) modal                                       */
/* ------------------------------------------------------------------ */

function SetBalanceModal({
  account,
  currentBalance,
  onClose,
}: {
  account: Account
  /** Computed balance from accounts.balances (undefined while loading) */
  currentBalance: number | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [value, setValue] = useState(() =>
    currentBalance !== undefined ? String(currentBalance) : ''
  )

  const reconcile = trpc.accounts.reconcile.useMutation({
    onSuccess: ({ adjustment }) => {
      toast.success(
        adjustment === 0
          ? 'Balance already matched'
          : `Balance set — adjusted by ${formatSignedMoney(adjustment, account.currency)}`
      )
      utils.invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const handleSave = () => {
    const actualBalance = parseFloat(value)
    if (!Number.isFinite(actualBalance)) {
      toast.error('Enter a valid number')
      return
    }
    reconcile.mutate({ id: account.id, actualBalance })
  }

  return (
    <Modal
      open
      title={`Set actual balance — ${account.name}`}
      onClose={() => {
        if (!reconcile.isPending) onClose()
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={reconcile.isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary${reconcile.isPending ? ' is-loading' : ''}`}
            disabled={reconcile.isPending}
            onClick={handleSave}
          >
            Set balance
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="field">
          <label htmlFor="acc-actual-balance">What's actually in this account right now?</label>
          <input
            id="acc-actual-balance"
            className="input"
            type="number"
            step="any"
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Budjet will adjust the baseline so the app matches reality. Your transactions are
          untouched.
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Accounts() {
  const accounts = trpc.accounts.list.useQuery()
  const balances = trpc.accounts.balances.useQuery()
  const utils = trpc.useUtils()
  const toast = useToast()
  const navigate = useNavigate()

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)

  const balanceById = useMemo(() => {
    const map = new Map<number, number>()
    balances.data?.forEach(b => map.set(b.id, b.balance))
    return map
  }, [balances.data])

  const del = trpc.accounts.delete.useMutation({
    onSuccess: () => {
      toast.success('Account deleted')
      utils.accounts.invalidate()
      setDeleteTarget(null)
    },
    onError: err => {
      // PRECONDITION_FAILED carries "Account has N transaction(s)…" — show it as-is.
      toast.error(err.message)
      setDeleteTarget(null)
    },
  })

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Accounts</h2>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <IconPlus size={15} /> Add Account
        </button>
      </div>

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
          {accounts.data.map(a => {
            const balance = balanceById.get(a.id)
            const meta = [a.type, a.bankName, a.emailSender].filter(Boolean).join(' · ')
            return (
              <div
                key={a.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/transactions?account=${a.id}`)}
                onKeyDown={e => {
                  if (e.key === 'Enter') navigate(`/transactions?account=${a.id}`)
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  {balance !== undefined ? (
                    <div
                      className="num"
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: balance >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {formatMoney(balance, a.currency)}
                    </div>
                  ) : (
                    <div className="num" style={{ fontSize: 18, color: 'var(--text-dim)' }}>…</div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 6,
                      marginTop: 8,
                    }}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setBalanceTarget(a)}
                    >
                      Set balance
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditTarget(a)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setDeleteTarget(a)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No accounts yet" hint="Add your first account to start tracking" />
        </div>
      )}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} />}

      {editTarget !== null && (
        <EditAccountModal
          key={editTarget.id}
          account={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {balanceTarget !== null && (
        <SetBalanceModal
          key={balanceTarget.id}
          account={balanceTarget}
          currentBalance={balanceById.get(balanceTarget.id)}
          onClose={() => setBalanceTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete account?"
        message={`"${deleteTarget?.name ?? ''}" will be permanently removed. Only accounts without transactions can be deleted.`}
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => {
          if (deleteTarget && !del.isPending) del.mutate({ id: deleteTarget.id })
        }}
        onCancel={() => {
          if (!del.isPending) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
