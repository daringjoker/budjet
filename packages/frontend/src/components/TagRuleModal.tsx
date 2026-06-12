import { useState } from 'react'
import { trpc } from '../trpc.js'
import { useToast } from './ui/Toast.js'
import Modal from './ui/Modal.js'

export interface TagRuleModalProps {
  open: boolean
  onClose: () => void
  /** Prefill for the pattern field (typically the row's remarks or description) */
  initialPattern?: string
  /** Prefill for the merchant name field */
  initialMerchant?: string
}

/**
 * Teach a merchant-tagging rule: remark pattern → merchant (+ optional
 * category), optionally applied to existing transactions right away.
 */
export default function TagRuleModal({
  open,
  onClose,
  initialPattern,
  initialMerchant,
}: TagRuleModalProps) {
  const toast = useToast()
  const utils = trpc.useUtils()

  const [pattern, setPattern] = useState(initialPattern ?? '')
  const [merchant, setMerchant] = useState(initialMerchant ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [applyToExisting, setApplyToExisting] = useState(true)

  const categories = trpc.categories.list.useQuery()

  const trimmedPattern = pattern.trim()
  const preview = trpc.merchants.previewMatches.useQuery(
    { pattern: trimmedPattern },
    { enabled: trimmedPattern.length >= 2 }
  )

  const createRule = trpc.merchants.createRule.useMutation({
    onSuccess: ({ applied }) => {
      toast.success(
        `Rule saved — ${applied} transaction${applied === 1 ? '' : 's'} tagged`
      )
      utils.invalidate()
      onClose()
    },
    onError: err => toast.error(err.message),
  })

  const handleSave = () => {
    if (trimmedPattern.length < 2) {
      toast.error('Pattern must be at least 2 characters')
      return
    }
    if (!merchant.trim()) {
      toast.error('Merchant name is required')
      return
    }
    createRule.mutate({
      pattern: trimmedPattern,
      merchant: merchant.trim(),
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      applyToExisting,
    })
  }

  const matchCount = preview.data?.count

  return (
    <Modal
      open={open}
      title="Tag merchant"
      onClose={() => {
        if (!createRule.isPending) onClose()
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={createRule.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary${createRule.isPending ? ' is-loading' : ''}`}
            disabled={createRule.isPending}
            onClick={handleSave}
          >
            Save rule
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="field">
          <label htmlFor="rule-pattern">Pattern</label>
          <input
            id="rule-pattern"
            className="input"
            placeholder="e.g. BHATBHATENI"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            autoFocus
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Any transaction whose remarks or description contains this text will be tagged
          </span>
          {trimmedPattern.length >= 2 && matchCount !== undefined && (
            <span
              style={{
                fontSize: 12,
                color: matchCount > 0 ? 'var(--success)' : 'var(--text-dim)',
              }}
            >
              Matches {matchCount} existing transaction{matchCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="rule-merchant">Merchant name</label>
          <input
            id="rule-merchant"
            className="input"
            placeholder="e.g. Bhatbhateni"
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rule-category">Category</label>
          <select
            id="rule-category"
            className="select"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
          >
            <option value="">Keep automatic</option>
            {categories.data?.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          }}
        >
          <input
            type="checkbox"
            checked={applyToExisting}
            onChange={e => setApplyToExisting(e.target.checked)}
          />
          Apply to existing matches
        </label>
      </div>
    </Modal>
  )
}
