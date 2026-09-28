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

  const pauseMutation = trpc.recurring.pause.useMutation({
    onSuccess: () => {
      toast.success('Recurring transaction paused')
      utils.recurring.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const resumeMutation = trpc.recurring.resume.useMutation({
    onSuccess: () => {
      toast.success('Recurring transaction resumed')
      utils.recurring.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const scanMutation = trpc.recurring.scan.useMutation({
    onSuccess: result => {
      toast.success(
        result.detected > 0
          ? `Found ${result.detected} recurring pattern${result.detected === 1 ? '' : 's'} — review below`
          : 'No new recurring patterns found'
      )
      utils.recurring.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const pending = recurring.data?.filter(r => r.status === 'pending_confirmation') ?? []
  const active = recurring.data?.filter(r => r.status === 'active') ?? []
  const paused = recurring.data?.filter(r => r.status === 'paused') ?? []

  return (
    <div>
      <div className="toolbar">
        <h2 className="card-title" style={{ marginBottom: 0 }}>Recurring Transactions</h2>
        <button
          type="button"
          className={`btn btn-ghost btn-sm${scanMutation.isPending ? ' is-loading' : ''}`}
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
        >
          Scan for patterns
        </button>
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
            hint="Click 'Scan for patterns' to detect recurring payments from your history"
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
              {active.map(r => {
                const pausing =
                  pauseMutation.isPending && pauseMutation.variables?.id === r.id
                const dismissing =
                  dismissMutation.isPending && dismissMutation.variables?.id === r.id
                return (
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="badge badge-success">ACTIVE</span>
                      <button
                        type="button"
                        className={`btn btn-ghost btn-sm${pausing ? ' is-loading' : ''}`}
                        disabled={pausing || dismissing}
                        onClick={() => pauseMutation.mutate({ id: r.id })}
                      >
                        Pause
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="card">
              <EmptyState title="No active recurring transactions" />
            </div>
          )}

          {paused.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12, marginTop: 20 }}>Paused</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {paused.map(r => {
                  const resuming =
                    resumeMutation.isPending && resumeMutation.variables?.id === r.id
                  const dismissingPaused =
                    dismissMutation.isPending && dismissMutation.variables?.id === r.id
                  return (
                    <div
                      key={r.id}
                      className="card"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, opacity: 0.7 }}
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
                          className={`btn btn-ghost btn-sm${resuming ? ' is-loading' : ''}`}
                          disabled={resuming || dismissingPaused}
                          onClick={() => resumeMutation.mutate({ id: r.id })}
                        >
                          Resume
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost btn-sm${dismissingPaused ? ' is-loading' : ''}`}
                          disabled={resuming || dismissingPaused}
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
