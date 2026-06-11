import { useState } from 'react'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import Modal from '../components/ui/Modal.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { formatDate, formatPercent, formatSignedMoney } from '../lib/format.js'

export default function Transactions() {
  const [filters, setFilters] = useState({ lowConfidenceOnly: false, limit: 100 })
  const transactions = trpc.transactions.list.useQuery(filters)
  const utils = trpc.useUtils()
  const toast = useToast()

  type Tx = NonNullable<typeof transactions.data>[number]
  const [editing, setEditing] = useState<Tx | null>(null)
  const [draft, setDraft] = useState('')

  const review = trpc.transactions.review.useMutation({
    onSuccess: () => {
      toast.success('Transaction updated')
      utils.transactions.list.invalidate()
      setEditing(null)
    },
    onError: err => toast.error(err.message),
  })

  const closeModal = () => {
    if (!review.isPending) setEditing(null)
  }

  return (
    <div>
      <div className="toolbar">
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={filters.lowConfidenceOnly}
            onChange={e => setFilters(v => ({ ...v, lowConfidenceOnly: e.target.checked }))}
          />
          Show low-confidence only
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th className="num">Amount</th>
              <th className="num">Confidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.isLoading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <Skeleton height={14} />
                  </td>
                </tr>
              ))}
            {transactions.data?.map(t => {
              const lowConf = t.llmConfidence !== null && t.llmConfidence < 0.85
              const signed = t.type === 'debit' ? -t.amount : t.amount
              return (
                <tr key={t.id}>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                  <td>
                    {t.description}
                    {lowConf && (
                      <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                        review
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${t.type === 'debit' ? 'badge-danger' : 'badge-success'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td
                    className="num"
                    style={{ fontWeight: 600, color: signed < 0 ? 'var(--danger)' : 'var(--success)' }}
                  >
                    {formatSignedMoney(signed)}
                  </td>
                  <td className="num" style={{ color: lowConf ? 'var(--warning)' : 'var(--text-dim)' }}>
                    {t.llmConfidence != null ? formatPercent(t.llmConfidence * 100) : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditing(t)
                        setDraft(t.description)
                      }}
                    >
                      Fix
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
            title="No transactions yet"
            hint="Imported transactions will show up here"
          />
        )}
      </div>

      <Modal
        open={editing !== null}
        title="Fix transaction"
        onClose={closeModal}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary${review.isPending ? ' is-loading' : ''}`}
              disabled={review.isPending}
              onClick={() => {
                if (!editing) return
                review.mutate({ id: editing.id, description: draft, llmConfidence: null })
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="fix-description">Description</label>
          <input
            id="fix-description"
            className="input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  )
}
