import { useState } from 'react'
import { trpc } from '../trpc.js'
import { useToast } from '../components/ui/Toast.js'
import ConfirmDialog from '../components/ui/ConfirmDialog.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { IconAlert } from '../components/icons.js'
import { formatMoney } from '../lib/format.js'
import { useCalendar } from '../lib/calendar.js'

export default function Recurring() {
  const { fmtDate } = useCalendar()
  const recurring = trpc.recurring.list.useQuery()
  const utils = trpc.useUtils()
  const toast = useToast()

  type Rec = NonNullable<typeof recurring.data>[number]
  const [toDismiss, setToDismiss] = useState<Rec | null>(null)

  const confirmMutation = trpc.recurring.confirm.useMutation({
    onSuccess: () => {
      toast.success('Recurring transaction confirmed')
      utils.recurring.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const dismissMutation = trpc.recurring.dismiss.useMutation({
    onSuccess: () => {
      toast.success('Recurring transaction dismissed')
      utils.recurring.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const pending = recurring.data?.filter(r => r.status === 'pending_confirmation') ?? []
  const active = recurring.data?.filter(r => r.status === 'active') ?? []

  return (
    <div>
      <div className="toolbar">
        <h2 className="card-title" style={{ marginBottom: 0 }}>Recurring Transactions</h2>
      </div>

      {recurring.isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={72} count={3} />
        </div>
      ) : recurring.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={recurring.error.message} />
        </div>
      ) : !recurring.data?.length ? (
        <div className="card">
          <EmptyState
            title="No recurring transactions yet"
            hint="Detected recurring payments will show up here"
          />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--warning)',
                  marginBottom: 12,
                }}
              >
                <IconAlert size={16} /> Pending confirmation
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {pending.map(r => {
                  const confirming =
                    confirmMutation.isPending && confirmMutation.variables?.id === r.id
                  const dismissing =
                    dismissMutation.isPending && dismissMutation.variables?.id === r.id
                  return (
                    <div
                      key={r.id}
                      className="card"
                      style={{
                        borderLeft: '3px solid var(--warning)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {formatMoney(r.amount, r.currency)} / {r.frequency}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className={`btn btn-primary btn-sm${confirming ? ' is-loading' : ''}`}
                          disabled={confirming || dismissing}
                          onClick={() => confirmMutation.mutate({ id: r.id })}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost btn-sm${dismissing ? ' is-loading' : ''}`}
                          disabled={confirming || dismissing}
                          onClick={() => setToDismiss(r)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>Active</h3>
          {active.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {active.map(r => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatMoney(r.amount, r.currency)} / {r.frequency} · next{' '}
                      {fmtDate(r.nextDueDate)}
                    </div>
                  </div>
                  <span className="badge badge-success">ACTIVE</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState title="No active recurring transactions" />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDismiss !== null}
        title="Dismiss recurring transaction?"
        message={
          toDismiss
            ? `"${toDismiss.name}" will be dismissed and no longer suggested.`
            : ''
        }
        confirmLabel="Dismiss"
        danger
        onConfirm={() => {
          if (toDismiss) dismissMutation.mutate({ id: toDismiss.id })
          setToDismiss(null)
        }}
        onCancel={() => setToDismiss(null)}
      />
    </div>
  )
}
