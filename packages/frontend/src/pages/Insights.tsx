import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc.js'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { IconAlert } from '../components/icons.js'
import { formatMoney, formatPercent, formatSignedMoney } from '../lib/format.js'
import { useCalendar, type CalendarKind } from '../lib/calendar.js'
import { addBsMonths, currentBsMonth, formatBsMonth } from '@budjet/shared'

/** Current month as "YYYY-MM" in the given calendar */
function currentMonthKey(calendar: CalendarKind): string {
  if (calendar === 'bs') {
    const { year, month } = currentBsMonth()
    return `${year}-${String(month).padStart(2, '0')}`
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-06" → "June 2026" (AD) / "2083-02" → "Jestha 2083" (BS) */
function monthTitle(m: string, calendar: CalendarKind): string {
  const [y, mo] = m.split('-').map(Number)
  if (calendar === 'bs') return formatBsMonth(y, mo)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Shift "YYYY-MM" by n months in the given calendar */
function shiftMonth(m: string, n: number, calendar: CalendarKind): string {
  const [y, mo] = m.split('-').map(Number)
  if (calendar === 'bs') {
    const r = addBsMonths(y, mo, n)
    return `${r.year}-${String(r.month).padStart(2, '0')}`
  }
  const d = new Date(y, mo - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** % change of curr vs prev (denominator |prev|); null when not computable */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

/** Dim sub-line under a stat value comparing to last month. */
function DeltaLine({ pct, goodWhenUp = true }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct === null) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>— vs last month</div>
    )
  }
  const up = pct >= 0
  const good = goodWhenUp ? up : !up
  return (
    <div
      style={{
        fontSize: 12,
        marginTop: 6,
        fontWeight: 500,
        color: good ? 'var(--success)' : 'var(--danger)',
      }}
    >
      {up ? '↑' : '↓'} {formatPercent(Math.abs(pct))} vs last month
    </div>
  )
}

const LINE_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
  fontSize: 13,
  padding: '7px 0',
} as const

const TXN_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '9px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
  cursor: 'pointer',
} as const

export default function Insights() {
  const navigate = useNavigate()
  const { calendar, fmtDate } = useCalendar()
  const nowKey = currentMonthKey(calendar)

  // Month state is tagged with the calendar it belongs to so a toggle flip
  // never sends a key from one calendar with the other's `calendar` param.
  const [monthState, setMonthState] = useState(() => ({ cal: calendar, key: nowKey }))
  const month = monthState.cal === calendar ? monthState.key : nowKey
  const setMonth = (key: string) => setMonthState({ cal: calendar, key })

  // Reset to the new calendar's current month when the toggle flips.
  useEffect(() => {
    setMonthState(s => (s.cal === calendar ? s : { cal: calendar, key: nowKey }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar])

  const insights = trpc.insights.monthly.useQuery({ month, calendar })

  const atCurrent = month === nowKey
  const data = insights.data

  const goTxn = (description: string) =>
    navigate(`/transactions?q=${encodeURIComponent(description)}`)

  // ----- derived stat deltas -----
  const tm = data?.thisMonth
  const lm = data?.lastMonth
  const incomePct = tm && lm ? pctChange(tm.totalIn, lm.totalIn) : null
  const spendingPct = tm && lm ? pctChange(tm.totalOut, lm.totalOut) : null
  const netPct = tm && lm ? pctChange(tm.net, lm.net) : null
  const savingsDeltaPts =
    tm?.savingsRate != null && lm?.savingsRate != null
      ? (tm.savingsRate - lm.savingsRate) * 100
      : null

  const cardHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  } as const

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ---------- Header: month navigation ---------- */}
      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>
          Insights
        </h2>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1, calendar))}
        >
          ‹
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 120, textAlign: 'center' }}>
          {monthTitle(month, calendar)}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Next month"
          disabled={atCurrent}
          onClick={() => setMonth(shiftMonth(month, 1, calendar))}
        >
          ›
        </button>
        {!atCurrent && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(nowKey)}>
            This month
          </button>
        )}
      </div>

      {insights.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={insights.error.message} />
        </div>
      ) : (
        <>
          {/* ---------- Row 1: stat cards ---------- */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 20,
            }}
          >
            <div className="stat-card">
              <div className="stat-label">Income</div>
              {insights.isLoading || !tm ? (
                <Skeleton height={30} width="70%" />
              ) : (
                <>
                  <div className="stat-value pos">{formatMoney(tm.totalIn)}</div>
                  <DeltaLine pct={incomePct} />
                </>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-label">Spending</div>
              {insights.isLoading || !tm ? (
                <Skeleton height={30} width="70%" />
              ) : (
                <>
                  <div className="stat-value neg">{formatMoney(tm.totalOut)}</div>
                  <DeltaLine pct={spendingPct} goodWhenUp={false} />
                </>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-label">Net</div>
              {insights.isLoading || !tm ? (
                <Skeleton height={30} width="70%" />
              ) : (
                <>
                  <div className={`stat-value ${tm.net >= 0 ? 'pos' : 'neg'}`}>
                    {formatSignedMoney(tm.net)}
                  </div>
                  <DeltaLine pct={netPct} />
                </>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-label">Savings rate</div>
              {insights.isLoading || !tm ? (
                <Skeleton height={30} width="70%" />
              ) : (
                <>
                  <div className="stat-value accent">
                    {tm.savingsRate === null ? '—' : formatPercent(tm.savingsRate * 100)}
                  </div>
                  {tm.savingsRate !== null && <DeltaLine pct={savingsDeltaPts} />}
                </>
              )}
            </div>
          </div>

          {/* ---------- Row 2: pace + movers ---------- */}
          <div className="grid-2">
            <div className="card">
              {insights.isLoading || !data ? (
                <>
                  <h2 className="card-title">Spending pace</h2>
                  <Skeleton height={20} count={4} />
                </>
              ) : data.pace ? (
                <>
                  <h2 className="card-title">Spending pace</h2>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    Month {data.pace.monthElapsedPct}% elapsed
                  </div>
                  <div className="progress" style={{ marginBottom: 14 }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(data.pace.monthElapsedPct, 100)}%` }}
                    />
                  </div>
                  <div style={LINE_STYLE}>
                    <span style={{ color: 'var(--text-muted)' }}>Spent so far</span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(data.pace.spentSoFar)}
                    </span>
                  </div>
                  <div style={LINE_STYLE}>
                    <span style={{ color: 'var(--text-muted)' }}>Same point last month</span>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="num" style={{ fontWeight: 600 }}>
                        {formatMoney(data.pace.lastMonthSamePoint)}
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color:
                            data.pace.spentSoFar > data.pace.lastMonthSamePoint
                              ? 'var(--danger)'
                              : 'var(--success)',
                        }}
                      >
                        {formatSignedMoney(data.pace.spentSoFar - data.pace.lastMonthSamePoint)}
                      </span>
                    </span>
                  </div>
                  <div style={LINE_STYLE}>
                    <span style={{ color: 'var(--text-muted)' }}>Projected month-end</span>
                    <span
                      className="num"
                      style={{
                        fontWeight: 600,
                        color:
                          data.pace.projectedOut <= data.lastMonth.totalOut
                            ? 'var(--success)'
                            : 'var(--danger)',
                      }}
                    >
                      {formatMoney(data.pace.projectedOut)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="card-title">Month complete</h2>
                  <div style={LINE_STYLE}>
                    <span style={{ color: 'var(--text-muted)' }}>Net</span>
                    <span
                      className="num"
                      style={{
                        fontWeight: 600,
                        color: data.thisMonth.net >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {formatSignedMoney(data.thisMonth.net)}
                    </span>
                  </div>
                  <div style={LINE_STYLE}>
                    <span style={{ color: 'var(--text-muted)' }}>Transactions</span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {data.thisMonth.count.toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2 className="card-title">Category movers vs last month</h2>
              {insights.isLoading || !data ? (
                <Skeleton height={20} count={5} />
              ) : data.movers.length ? (
                data.movers.map((mv, i) => (
                  <div
                    key={mv.categoryId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 0',
                      borderBottom:
                        i === data.movers.length - 1 ? 'none' : '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: mv.categoryColor,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mv.categoryName}
                    </span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(mv.current)}
                    </span>
                    <span
                      className={`badge ${mv.delta > 0 ? 'badge-danger' : 'badge-success'}`}
                      title={`Last month ${formatMoney(mv.previous)}`}
                    >
                      {mv.delta > 0 ? '▲' : '▼'} {formatSignedMoney(mv.delta)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="Not enough history yet" />
              )}
            </div>
          </div>

          {/* ---------- Row 3: largest + unusual ---------- */}
          <div className="grid-2">
            <div className="card">
              <h2 className="card-title">Largest expenses</h2>
              {insights.isLoading || !data ? (
                <Skeleton height={20} count={5} />
              ) : data.largest.length ? (
                data.largest.map((t, i) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    title="View in transactions"
                    onClick={() => goTxn(t.description)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goTxn(t.description)
                      }
                    }}
                    style={{
                      ...TXN_ROW_STYLE,
                      borderBottom:
                        i === data.largest.length - 1 ? 'none' : TXN_ROW_STYLE.borderBottom,
                    }}
                  >
                    <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {fmtDate(new Date(t.date))}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.description}
                      {t.merchant && (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          {t.merchant}
                        </span>
                      )}
                    </span>
                    <span className="num" style={{ fontWeight: 700, color: 'var(--danger)' }}>
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="No expenses this month" />
              )}
            </div>

            <div className="card">
              <h2
                className="card-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <IconAlert size={16} style={{ color: 'var(--warning)' }} /> Unusual activity
              </h2>
              {insights.isLoading || !data ? (
                <Skeleton height={20} count={5} />
              ) : data.unusual.length ? (
                data.unusual.map((t, i) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    title="View in transactions"
                    onClick={() => goTxn(t.description)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goTxn(t.description)
                      }
                    }}
                    style={{
                      ...TXN_ROW_STYLE,
                      flexWrap: 'wrap',
                      borderBottom:
                        i === data.unusual.length - 1 ? 'none' : TXN_ROW_STYLE.borderBottom,
                    }}
                  >
                    <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {fmtDate(new Date(t.date))}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.description}
                      {t.merchant && (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          {t.merchant}
                        </span>
                      )}
                    </span>
                    <span className="num" style={{ fontWeight: 700, color: 'var(--danger)' }}>
                      {formatMoney(t.amount)}
                    </span>
                    <span
                      style={{
                        flexBasis: '100%',
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        marginTop: -4,
                      }}
                    >
                      {(t.amount / t.categoryMedian).toFixed(1)}× your typical {t.categoryName}{' '}
                      spend ({formatMoney(t.categoryMedian)} median)
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="Nothing unusual this month ✓" />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
