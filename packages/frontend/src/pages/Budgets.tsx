import { useMemo, useState } from 'react'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import Modal from '../components/ui/Modal.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { IconPlus } from '../components/icons.js'
import { formatMoney, formatPercent } from '../lib/format.js'

type Period = 'monthly' | 'weekly' | 'yearly' | 'custom'

/** Row shape from budgets.list (dates arrive serialized). */
interface Budget {
  id: number
  name: string
  categoryId: number | null
  accountId: number | null
  amount: number
  period: Period
}

interface NamedItem {
  id: number
  name: string
}

/* ------------------------------------------------------------------ */
/* Budget card                                                         */
/* ------------------------------------------------------------------ */

function BudgetCard({
  budget,
  categoryName,
  accountName,
  onEdit,
}: {
  budget: Budget
  categoryName: string | undefined
  accountName: string | undefined
  onEdit: (b: Budget) => void
}) {
  const progress = trpc.budgets.progress.useQuery({ id: budget.id })
  const p = progress.data
  const pct = p?.percentUsed ?? 0
  const level = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success'

  const scope =
    categoryName && accountName
      ? `${categoryName} · ${accountName}`
      : categoryName ?? accountName ?? 'All spending'

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {budget.name}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span className="badge badge-muted">{budget.period}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(budget)}>
            Edit
          </button>
        </span>
      </div>
      {progress.isLoading ? (
        <Skeleton height={8} count={2} />
      ) : p ? (
        <>
          <div className="progress" style={{ marginBottom: 10 }}>
            <div className={`progress-fill ${level}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Spent {formatMoney(p.spent)}</span>
            <span style={{ color: `var(--${level})`, fontWeight: 600 }}>{formatPercent(pct)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Limit {formatMoney(p.budgetAmount)}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>{scope}</div>
        </>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Create / Edit modal                                                 */
/* ------------------------------------------------------------------ */

function BudgetModal({
  budget,
  categories,
  accounts,
  onClose,
}: {
  /** null = create mode, otherwise the budget being edited */
  budget: Budget | null
  categories: NamedItem[]
  accounts: NamedItem[]
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const isEdit = budget !== null

  const [form, setForm] = useState(() => ({
    name: budget?.name ?? '',
    amount: budget ? String(budget.amount) : '',
    period: (budget?.period ?? 'monthly') as Period,
    categoryId: budget?.categoryId != null ? String(budget.categoryId) : '',
    accountId: budget?.accountId != null ? String(budget.accountId) : '',
  }))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onSuccess = (msg: string) => {
    toast.success(msg)
    utils.budgets.invalidate()
    onClose()
  }

  const create = trpc.budgets.create.useMutation({
    onSuccess: () => onSuccess('Budget created'),
    onError: err => toast.error(err.message),
  })

  const update = trpc.budgets.update.useMutation({
    onSuccess: () => onSuccess('Budget updated'),
    onError: err => toast.error(err.message),
  })

  const del = trpc.budgets.delete.useMutation({
    onSuccess: () => {
      setConfirmDelete(false)
      onSuccess('Budget deleted')
    },
    onError: err => {
      toast.error(err.message)
      setConfirmDelete(false)
    },
  })

  const pending = create.isPending || update.isPending
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(v => ({ ...v, [key]: value }))

  const handleSave = () => {
    const name = form.name.trim()
    const amount = parseFloat(form.amount)
    if (!name) {
      toast.error('Name is required')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    if (isEdit && budget) {
      update.mutate({
        id: budget.id,
        name,
        amount,
        period: form.period,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        accountId: form.accountId ? Number(form.accountId) : null,
      })
    } else {
      const now = new Date()
      create.mutate({
        name,
        amount,
        period: form.period,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        ...(form.categoryId ? { categoryId: Number(form.categoryId) } : {}),
        ...(form.accountId ? { accountId: Number(form.accountId) } : {}),
      })
    }
  }

  return (
    <>
      <Modal
        open
        title={isEdit ? 'Edit budget' : 'New budget'}
        onClose={() => {
          if (!pending && !del.isPending) onClose()
        }}
        footer={
          <>
            {isEdit && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginRight: 'auto' }}
                disabled={pending || del.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary${pending ? ' is-loading' : ''}`}
              disabled={pending}
              onClick={handleSave}
            >
              Save
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="field">
            <label htmlFor="budget-name">Name</label>
            <input
              id="budget-name"
              className="input"
              placeholder="e.g. Groceries"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="budget-amount">Amount</label>
              <input
                id="budget-amount"
                type="number"
                step="any"
                min="0"
                className="input"
                placeholder="0.00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="budget-period">Period</label>
              <select
                id="budget-period"
                className="select"
                value={form.period}
                onChange={e => set('period', e.target.value as Period)}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
                {budget?.period === 'custom' && <option value="custom">Custom</option>}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="budget-category">Category</label>
            <select
              id="budget-category"
              className="select"
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="budget-account">Account</label>
            <select
              id="budget-account"
              className="select"
              value={form.accountId}
              onChange={e => set('accountId', e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete budget?"
        message={`"${budget?.name ?? ''}" will be removed. Existing transactions are unaffected.`}
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => {
          if (budget && !del.isPending) del.mutate({ id: budget.id })
        }}
        onCancel={() => {
          if (!del.isPending) setConfirmDelete(false)
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Budgets() {
  const budgets = trpc.budgets.list.useQuery()
  const categories = trpc.categories.list.useQuery()
  const accounts = trpc.accounts.list.useQuery()

  // ----- Modal state: undefined = closed, null = create, Budget = edit -----
  const [modalBudget, setModalBudget] = useState<Budget | null | undefined>(undefined)

  const categoryName = useMemo(() => {
    const map = new Map<number, string>()
    categories.data?.forEach(c => map.set(c.id, c.name))
    return map
  }, [categories.data])

  const accountName = useMemo(() => {
    const map = new Map<number, string>()
    accounts.data?.forEach(a => map.set(a.id, a.name))
    return map
  }, [accounts.data])

  const sortedCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categories.data]
  )

  return (
    <div>
      <div className="toolbar">
        <h2 className="card-title" style={{ marginBottom: 0 }}>Budgets</h2>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setModalBudget(null)}>
          <IconPlus size={15} /> New budget
        </button>
      </div>

      {budgets.isLoading ? (
        <div className="grid-2">
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
      ) : budgets.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={budgets.error.message} />
        </div>
      ) : budgets.data?.length ? (
        <div className="grid-2">
          {budgets.data.map(b => (
            <BudgetCard
              key={b.id}
              budget={b}
              categoryName={b.categoryId != null ? categoryName.get(b.categoryId) : undefined}
              accountName={b.accountId != null ? accountName.get(b.accountId) : undefined}
              onEdit={setModalBudget}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No budgets yet" hint="Create your first budget" />
        </div>
      )}

      {modalBudget !== undefined && (
        <BudgetModal
          budget={modalBudget}
          categories={sortedCategories}
          accounts={accounts.data ?? []}
          onClose={() => setModalBudget(undefined)}
        />
      )}
    </div>
  )
}
