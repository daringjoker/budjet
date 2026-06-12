import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import Modal from '../components/ui/Modal.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import TagRuleModal from '../components/TagRuleModal.js'
import { IconPlus } from '../components/icons.js'
import { formatDate, formatSignedMoney } from '../lib/format.js'

type TxType = 'debit' | 'credit'

/** Row shape used by the table + edit modal (subset of transactions.list output). */
interface Tx {
  id: number
  accountId: number
  date: string | Date
  amount: number
  type: TxType
  description: string
  remarks: string | null
  merchant: string | null
  source: string
  llmConfidence: number | null
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
}

/** Local "yyyy-mm-dd" (avoids UTC shift from toISOString) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function isLowConfidence(t: Pick<Tx, 'llmConfidence'>): boolean {
  return t.llmConfidence !== null && t.llmConfidence < 0.85
}

const COL_COUNT = 9

/* ------------------------------------------------------------------ */
/* Add / Edit modal                                                    */
/* ------------------------------------------------------------------ */

interface TransactionModalProps {
  /** null = create mode, otherwise the row being edited */
  tx: Tx | null
  accounts: Array<{ id: number; name: string }>
  categories: Array<{ id: number; name: string }>
  onClose: () => void
  /** Edit mode only: close this modal and open the tag-rule modal prefilled from the row */
  onCreateRule: (tx: Tx) => void
}

function TransactionModal({ tx, accounts, categories, onClose, onCreateRule }: TransactionModalProps) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const isEdit = tx !== null
  const wasLowConf = tx !== null && isLowConfidence(tx)

  const [form, setForm] = useState(() => ({
    date: tx ? ymd(new Date(tx.date)) : ymd(new Date()),
    accountId: String(tx?.accountId ?? accounts[0]?.id ?? ''),
    type: (tx?.type ?? 'debit') as TxType,
    amount: tx ? String(tx.amount) : '',
    description: tx?.description ?? '',
    remarks: tx?.remarks ?? '',
    merchant: tx?.merchant ?? '',
    categoryId: tx?.categoryId != null ? String(tx.categoryId) : '',
  }))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const invalidate = () => {
    utils.transactions.list.invalidate()
    utils.reports.summary.invalidate()
  }

  const review = trpc.transactions.review.useMutation({
    onSettled: () => utils.transactions.list.invalidate(),
  })

  const create = trpc.transactions.create.useMutation({
    onSuccess: () => {
      toast.success('Transaction added')
      invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const update = trpc.transactions.update.useMutation({
    onSuccess: () => {
      // Editing a low-confidence row also clears its review flag.
      if (wasLowConf && tx) review.mutate({ id: tx.id, llmConfidence: null })
      toast.success('Transaction updated')
      invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const del = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      toast.success('Transaction deleted')
      invalidate()
      setConfirmDelete(false)
      onClose()
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
    const description = form.description.trim()
    const amount = parseFloat(form.amount)
    const accountId = Number(form.accountId)
    if (!description) {
      toast.error('Description is required')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    if (!accountId) {
      toast.error('Account is required')
      return
    }
    const date = new Date(form.date).toISOString()
    if (isEdit && tx) {
      update.mutate({
        id: tx.id,
        accountId,
        date,
        description,
        type: form.type,
        amount,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        remarks: form.remarks.trim() || null,
        merchant: form.merchant.trim() || null,
      })
    } else {
      create.mutate({
        accountId,
        date,
        amount,
        type: form.type,
        description,
        source: 'manual',
        ...(form.categoryId ? { categoryId: Number(form.categoryId) } : {}),
      })
    }
  }

  return (
    <>
      <Modal
        open
        title={isEdit ? 'Edit transaction' : 'Add transaction'}
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
          <div className="grid-2">
            <div className="field">
              <label htmlFor="tx-date">Date</label>
              <input
                id="tx-date"
                type="date"
                className="input"
                value={form.date}
                onChange={e => {
                  if (e.target.value) set('date', e.target.value)
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="tx-account">Account</label>
              <select
                id="tx-account"
                className="select"
                value={form.accountId}
                onChange={e => set('accountId', e.target.value)}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-type">Type</label>
              <select
                id="tx-type"
                className="select"
                value={form.type}
                onChange={e => set('type', e.target.value as TxType)}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-amount">Amount</label>
              <input
                id="tx-amount"
                type="number"
                step="any"
                min="0"
                className="input"
                placeholder="0.00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="tx-description">Description</label>
            <input
              id="tx-description"
              className="input"
              placeholder="e.g. Groceries at Bhatbhateni"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              autoFocus={isEdit}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-category">Category</label>
            <select
              id="tx-category"
              className="select"
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <>
              <div className="field">
                <label htmlFor="tx-remarks">Remarks</label>
                <textarea
                  id="tx-remarks"
                  className="input"
                  rows={2}
                  placeholder="Full bank remarks"
                  value={form.remarks}
                  onChange={e => set('remarks', e.target.value)}
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    resize: 'vertical',
                    background: 'var(--surface)',
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="tx-merchant">Merchant</label>
                <input
                  id="tx-merchant"
                  className="input"
                  placeholder="e.g. Bhatbhateni"
                  value={form.merchant}
                  onChange={e => set('merchant', e.target.value)}
                />
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending || del.isPending}
                  onClick={() => {
                    if (tx) onCreateRule(tx)
                  }}
                >
                  Create rule from this…
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete transaction?"
        message={`"${tx?.description ?? ''}" will be permanently removed.`}
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => {
          if (tx && !del.isPending) del.mutate({ id: tx.id })
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

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()

  // ----- URL-driven filters -----
  const accountParam = searchParams.get('account') ?? ''
  const categoryParam = searchParams.get('category') ?? ''
  const merchantParam = searchParams.get('merchant') ?? ''
  const typeParam = searchParams.get('type') ?? ''
  const fromParam = searchParams.get('from') ?? ''
  const toParam = searchParams.get('to') ?? ''
  const reviewOnly = searchParams.get('review') === '1'
  const qParam = searchParams.get('q') ?? ''

  const setParam = (key: string, value: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true }
    )
  }

  const accountId = accountParam ? Number(accountParam) : undefined
  const categoryId = categoryParam ? Number(categoryParam) : undefined
  const typeFilter = typeParam === 'debit' || typeParam === 'credit' ? typeParam : undefined
  const fromISO = fromParam ? new Date(fromParam).toISOString() : undefined
  const toISO = toParam ? new Date(`${toParam}T23:59:59.999Z`).toISOString() : undefined

  // ----- Search box: live input, debounced 300ms into the `q` URL param -----
  const [qInput, setQInput] = useState(qParam)
  const lastQWritten = useRef(qParam)

  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qParam) {
        lastQWritten.current = qInput
        setParam('q', qInput)
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  // Sync the input when `q` changes externally (e.g. via the command palette).
  useEffect(() => {
    if (qParam !== lastQWritten.current) {
      lastQWritten.current = qParam
      setQInput(qParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam])

  // ----- Queries -----
  const transactions = trpc.transactions.list.useQuery({
    accountId,
    categoryId,
    merchant: merchantParam || undefined,
    q: qParam.trim() || undefined,
    type: typeFilter,
    from: fromISO,
    to: toISO,
    lowConfidenceOnly: reviewOnly || undefined,
    limit: 100,
  })

  // Summary covers everything when no date filter is set.
  const summary = trpc.reports.summary.useQuery({
    from: fromISO ?? new Date('2000-01-01').toISOString(),
    to: toISO ?? new Date(`${ymd(new Date())}T23:59:59.999Z`).toISOString(),
    accountId,
    categoryId,
  })

  const accounts = trpc.accounts.list.useQuery()
  const categories = trpc.categories.list.useQuery()

  const accountName = useMemo(() => {
    const map = new Map<number, string>()
    accounts.data?.forEach(a => map.set(a.id, a.name))
    return map
  }, [accounts.data])

  const sortedCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categories.data]
  )

  const activeCategory = categoryId
    ? sortedCategories.find(c => c.id === categoryId)
    : undefined

  // ----- Modal state: undefined = closed, null = create, Tx = edit -----
  const [modalTx, setModalTx] = useState<Tx | null | undefined>(undefined)

  // Tag-rule modal prefill (null = closed)
  const [rulePrefill, setRulePrefill] = useState<{ pattern: string; merchant: string } | null>(
    null
  )

  const openRuleModal = (tx: Tx) => {
    setModalTx(undefined)
    setRulePrefill({
      pattern: tx.remarks?.trim() || tx.description,
      merchant: tx.merchant ?? '',
    })
  }

  // reports.summary doesn't accept merchant/text filters, so when either is
  // active we compute the strip's four numbers client-side from the loaded list.
  const merchantActive = merchantParam !== ''
  const qActive = qParam.trim() !== ''
  const clientSide = merchantActive || qActive
  const clientSummary = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    for (const t of transactions.data ?? []) {
      if (t.type === 'credit') totalIn += t.amount
      else totalOut += t.amount
    }
    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      transactionCount: transactions.data?.length ?? 0,
    }
  }, [transactions.data])

  const stripData = clientSide ? clientSummary : summary.data
  const stripLoading = clientSide ? transactions.isLoading : summary.isLoading
  const net = stripData?.net ?? 0

  // ----- CSV export of the currently loaded (filtered) rows -----
  const exportCsv = useCallback(() => {
    const rows = transactions.data ?? []
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['id,date,account,type,amount,currency,description,remarks,merchant,category,source']
    for (const t of rows) {
      lines.push(
        [
          t.id,
          ymd(new Date(t.date)),
          accountName.get(t.accountId) ?? '',
          t.type,
          t.amount,
          t.currency,
          t.description,
          t.remarks ?? '',
          t.merchant ?? '',
          t.categoryName ?? '',
          t.source,
        ]
          .map(esc)
          .join(',')
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `budjet-transactions-${ymd(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} transactions`)
  }, [transactions.data, accountName, toast])

  // ----- ?new=1 → open the Add-transaction modal, then strip the param -----
  const newParam = searchParams.get('new')
  useEffect(() => {
    if (newParam === '1') {
      setModalTx(null)
      setParam('new', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam])

  // ----- ?export=1 → export the current filtered list once loaded, then strip -----
  const exportParam = searchParams.get('export')
  const exportedOnce = useRef(false)
  useEffect(() => {
    if (exportParam !== '1') {
      exportedOnce.current = false
      return
    }
    if (transactions.data && !exportedOnce.current) {
      exportedOnce.current = true
      exportCsv()
      setParam('export', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportParam, transactions.data, exportCsv])

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ---------- Filter toolbar ---------- */}
      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="tx-filter-q">Search</label>
          <input
            id="tx-filter-q"
            className="input"
            placeholder="Search…"
            style={{ width: 200 }}
            value={qInput}
            onChange={e => setQInput(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-filter-account">Account</label>
          <select
            id="tx-filter-account"
            className="select"
            value={accountParam}
            onChange={e => setParam('account', e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.data?.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-filter-category">Category</label>
          <select
            id="tx-filter-category"
            className="select"
            value={categoryParam}
            onChange={e => setParam('category', e.target.value)}
          >
            <option value="">All categories</option>
            {sortedCategories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-filter-type">Type</label>
          <select
            id="tx-filter-type"
            className="select"
            value={typeFilter ?? ''}
            onChange={e => setParam('type', e.target.value)}
          >
            <option value="">All</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-filter-from">From</label>
          <input
            id="tx-filter-from"
            type="date"
            className="input"
            value={fromParam}
            onChange={e => setParam('from', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-filter-to">To</label>
          <input
            id="tx-filter-to"
            type="date"
            className="input"
            value={toParam}
            onChange={e => setParam('to', e.target.value)}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            userSelect: 'none',
            paddingBottom: 9,
          }}
        >
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={e => setParam('review', e.target.checked ? '1' : '')}
          />
          Low-confidence only
        </label>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!transactions.data}
          onClick={exportCsv}
        >
          Export CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setModalTx(null)}>
          <IconPlus size={15} /> Add transaction
        </button>
      </div>

      {/* ---------- Active-filter summary strip ---------- */}
      <div>
        {activeCategory && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: activeCategory.color,
                flexShrink: 0,
              }}
            />
            <span>
              Category: <strong>{activeCategory.name}</strong>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setParam('category', '')}
            >
              ✕ Clear
            </button>
          </div>
        )}
        {merchantActive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            <span>
              Merchant: <strong>{merchantParam}</strong>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setParam('merchant', '')}
            >
              ✕ Clear
            </button>
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 20,
          }}
        >
          <div className="stat-card">
            <div className="stat-label">Total in</div>
            {stripLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value pos">
                {formatSignedMoney(stripData?.totalIn ?? 0)}
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Total out</div>
            {stripLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value neg">
                {formatSignedMoney(-(stripData?.totalOut ?? 0))}
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Net</div>
            {stripLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className={`stat-value ${net >= 0 ? 'pos' : 'neg'}`}>
                {formatSignedMoney(net)}
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Count</div>
            {stripLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value accent">
                {(stripData?.transactionCount ?? 0).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Table ---------- */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Merchant</th>
              <th>Account</th>
              <th>Type</th>
              <th>Source</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {transactions.isLoading &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={COL_COUNT}>
                    <Skeleton height={14} />
                  </td>
                </tr>
              ))}
            {transactions.data?.map(t => {
              const lowConf = isLowConfidence(t)
              const signed = t.type === 'debit' ? -t.amount : t.amount
              return (
                <tr key={t.id}>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(new Date(t.date))}
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.description}
                      {lowConf && (
                        <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                          review
                        </span>
                      )}
                    </div>
                    {t.remarks && t.remarks !== t.description && (
                      <div
                        title={t.remarks}
                        style={{
                          fontSize: 11,
                          color: 'var(--text-dim)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.remarks}
                      </div>
                    )}
                  </td>
                  <td>
                    {t.categoryId !== null && t.categoryName ? (
                      <button
                        type="button"
                        title={`Filter by ${t.categoryName}`}
                        onClick={() => setParam('category', String(t.categoryId))}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          font: 'inherit',
                          color: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: t.categoryColor ?? 'var(--text-dim)',
                            flexShrink: 0,
                          }}
                        />
                        {t.categoryName}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {t.merchant ? (
                      <button
                        type="button"
                        className="badge"
                        title={`Filter by ${t.merchant}`}
                        onClick={() => setParam('merchant', t.merchant ?? '')}
                        style={{ cursor: 'pointer' }}
                      >
                        {t.merchant}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, color: 'var(--text-dim)' }}
                        onClick={() => openRuleModal(t)}
                      >
                        + tag
                      </button>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {accountName.get(t.accountId) ?? '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${t.type === 'debit' ? 'badge-danger' : 'badge-success'}`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td>
                    {t.source === 'manual' ? (
                      <span className="badge badge-muted">manual</span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>{t.source}</span>
                    )}
                  </td>
                  <td
                    className="num"
                    style={{
                      fontWeight: 600,
                      color: signed < 0 ? 'var(--danger)' : 'var(--success)',
                    }}
                  >
                    {formatSignedMoney(signed)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setModalTx(t)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {transactions.isError && (
          <EmptyState title="Couldn't load data" hint={transactions.error.message} />
        )}
        {!transactions.isLoading && !transactions.isError && !transactions.data?.length && (
          <EmptyState
            title="No transactions match these filters"
            hint="Try adjusting the filters above, or add one manually"
          />
        )}
      </div>


      {/* ---------- Add / Edit modal ---------- */}
      {modalTx !== undefined && (
        <TransactionModal
          tx={modalTx}
          accounts={accounts.data ?? []}
          categories={sortedCategories}
          onClose={() => setModalTx(undefined)}
          onCreateRule={openRuleModal}
        />
      )}

      {/* ---------- Tag-rule modal ---------- */}
      {rulePrefill !== null && (
        <TagRuleModal
          open
          initialPattern={rulePrefill.pattern}
          initialMerchant={rulePrefill.merchant}
          onClose={() => setRulePrefill(null)}
        />
      )}
    </div>
  )
}
