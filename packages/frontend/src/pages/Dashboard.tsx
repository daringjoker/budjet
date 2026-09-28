import { useState } from 'react'
import { trpc } from '../trpc.js'
import { Link, useNavigate } from 'react-router-dom'
import Modal from '../components/ui/Modal.js'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { useToast } from '../components/ui/Toast.js'
import { formatMoney, formatPercent, formatSignedMoney } from '../lib/format.js'
import { useCalendar } from '../lib/calendar.js'
import { addBsMonths, currentBsMonth } from '@budjet/shared'

const TOOLTIP_STYLE = {
  background: '#1a2540',
  border: '1px solid #243049',
  borderRadius: 8,
} as const

const TOOLTIP_TEXT = { color: '#e6ebf4' } as const

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function bsKey(ym: { year: number; month: number }): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`
}

/** Local "yyyy-mm-dd" (avoids UTC shift from toISOString) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** % change of curr vs prev (denominator |prev|); null when not computable */
function pctChange(curr: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

/** Small dim sub-line under a stat value comparing to last month. */
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-muted)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  )
}

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '9px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
} as const

export default function Dashboard() {
  const navigate = useNavigate()
  const { calendar, fmtDate, fmtMonthKey } = useCalendar()
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const summary = trpc.reports.summary.useQuery({ from, to })
  const trend = trpc.reports.trend.useQuery({ months: 4, calendar })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from, to })
  const upcoming = trpc.predicted.list.useQuery({ status: 'pending' })
  const balances = trpc.accounts.balances.useQuery()
  const recent = trpc.transactions.list.useQuery({ limit: 8 })

  const utils = trpc.useUtils()
  const toast = useToast()
  const forecast = trpc.predicted.runForecast.useMutation({
    onSuccess: result => {
      toast.success(`Forecast: ${result.predictions} new predictions`)
      utils.predicted.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const categories = trpc.categories.list.useQuery()

  const [addOpen, setAddOpen] = useState(false)
  const [anticipatedForm, setAnticipatedForm] = useState({
    accountId: '',
    amount: '',
    date: '',
    notes: '',
    categoryId: '',
  })

  const createAnticipated = trpc.predicted.createAnticipated.useMutation({
    onSuccess: () => {
      toast.success('Anticipated expense added')
      setAddOpen(false)
      setAnticipatedForm({ accountId: '', amount: '', date: '', notes: '', categoryId: '' })
      utils.predicted.list.invalidate()
    },
    onError: err => toast.error(err.message),
  })

  const handleAddAnticipated = () => {
    const amount = parseFloat(anticipatedForm.amount)
    if (!anticipatedForm.accountId || isNaN(amount) || amount <= 0 || !anticipatedForm.date) {
      toast.error('Account, amount, and date are required')
      return
    }
    createAnticipated.mutate({
      accountId: Number(anticipatedForm.accountId),
      predictedAmount: amount,
      predictedDate: new Date(anticipatedForm.date).toISOString(),
      notes: anticipatedForm.notes || undefined,
      categoryId: anticipatedForm.categoryId ? Number(anticipatedForm.categoryId) : undefined,
    })
  }

  // ----- This-month stats + vs-last-month deltas (from trend) -----
  const income = summary.data?.totalIn ?? 0
  const spending = summary.data?.totalOut ?? 0
  const net = summary.data?.net ?? 0
  const savingsRate = income > 0 ? (net / income) * 100 : null

  const bsNow = currentBsMonth(now)
  const currKey =
    calendar === 'bs' ? bsKey(bsNow) : monthKey(now)
  const prevKey =
    calendar === 'bs'
      ? bsKey(addBsMonths(bsNow.year, bsNow.month, -1))
      : monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const prevMonth = trend.data?.find(t => t.month === prevKey)
  const currMonth = trend.data?.find(t => t.month === currKey)
  const prevNet = prevMonth ? prevMonth.totalIn - prevMonth.totalOut : undefined
  const prevRate =
    prevMonth && prevMonth.totalIn > 0
      ? ((prevMonth.totalIn - prevMonth.totalOut) / prevMonth.totalIn) * 100
      : undefined
  const deltasReady = !trend.isLoading && !trend.isError && currMonth !== undefined

  // ----- Category donut: top 6 + Others -----
  const totalSpend = breakdown.data?.reduce((acc, c) => acc + c.total, 0) ?? 0
  const topCategories = breakdown.data?.slice(0, 6) ?? []
  const othersTotal = breakdown.data?.slice(6).reduce((acc, c) => acc + c.total, 0) ?? 0
  const donutData = [
    ...topCategories.map(c => ({
      id: c.categoryId as number | null,
      name: c.categoryName,
      value: c.total,
      color: c.categoryColor,
    })),
    ...(othersTotal > 0
      ? [{ id: null as number | null, name: 'Others', value: othersTotal, color: '#5d6b85' }]
      : []),
  ]

  const upcomingRows = upcoming.data
    ? [...upcoming.data]
        .sort(
          (a, b) => new Date(a.predictedDate).getTime() - new Date(b.predictedDate).getTime()
        )
        .slice(0, 6)
    : []

  const cardHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  } as const

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ---------- Row 1: stat cards ---------- */}
      {summary.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load data" hint={summary.error.message} />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 20,
          }}
        >
          <div className="stat-card">
            <div className="stat-label">Income</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <>
                <div className="stat-value pos">{formatMoney(income)}</div>
                {deltasReady && <DeltaLine pct={pctChange(income, prevMonth?.totalIn)} />}
              </>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Spending</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <>
                <div className="stat-value neg">{formatMoney(spending)}</div>
                {deltasReady && (
                  <DeltaLine pct={pctChange(spending, prevMonth?.totalOut)} goodWhenUp={false} />
                )}
              </>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Net</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <>
                <div className={`stat-value ${net >= 0 ? 'pos' : 'neg'}`}>
                  {formatSignedMoney(net)}
                </div>
                {deltasReady && <DeltaLine pct={pctChange(net, prevNet)} />}
              </>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Savings rate</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <>
                <div className="stat-value accent">
                  {savingsRate === null ? '—' : formatPercent(savingsRate)}
                </div>
                {deltasReady && savingsRate !== null && (
                  <DeltaLine
                    pct={prevRate === undefined ? null : savingsRate - prevRate}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- Row 2: cash flow + category donut ---------- */}
      <div className="grid-2">
        <div className="card">
          <div style={cardHeaderStyle}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              Cash flow
            </h2>
            <div style={{ display: 'flex', gap: 14 }}>
              <LegendDot color="#2dd4a7" label="In" />
              <LegendDot color="#ff6b7a" label="Out" />
            </div>
          </div>
          {trend.isLoading ? (
            <Skeleton height={220} />
          ) : trend.isError ? (
            <EmptyState title="Couldn't load data" hint={trend.error.message} />
          ) : trend.data?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend.data} barGap={4}>
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonthKey}
                  tick={{ fill: '#8b96ab', fontSize: 12 }}
                  axisLine={{ stroke: '#243049' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8b96ab', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v))}
                  labelFormatter={(m) => fmtMonthKey(String(m))}
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={TOOLTIP_TEXT}
                  labelStyle={TOOLTIP_TEXT}
                  cursor={{ fill: 'rgba(109, 124, 255, 0.08)' }}
                />
                <Bar dataKey="totalIn" name="In" fill="#2dd4a7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalOut" name="Out" fill="#ff6b7a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No activity yet" hint="Monthly cash flow will appear here" />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Spending by category</h2>
          {breakdown.isLoading ? (
            <Skeleton height={220} />
          ) : breakdown.isError ? (
            <EmptyState title="Couldn't load data" hint={breakdown.error.message} />
          ) : donutData.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 180, height: 200, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      stroke="#131c2e"
                      strokeWidth={2}
                    >
                      {donutData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatMoney(Number(v))}
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={TOOLTIP_TEXT}
                      labelStyle={TOOLTIP_TEXT}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>This month</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(totalSpend)}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 8 }}>
                {donutData.map(d => (
                  <div
                    key={d.name}
                    role={d.id !== null ? 'button' : undefined}
                    tabIndex={d.id !== null ? 0 : undefined}
                    title={d.id !== null ? `View ${d.name} transactions` : undefined}
                    onClick={
                      d.id !== null
                        ? () =>
                            navigate(
                              `/transactions?category=${d.id}&from=${ymd(
                                new Date(now.getFullYear(), now.getMonth(), 1)
                              )}&to=${ymd(now)}`
                            )
                        : undefined
                    }
                    onKeyDown={
                      d.id !== null
                        ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(
                                `/transactions?category=${d.id}&from=${ymd(
                                  new Date(now.getFullYear(), now.getMonth(), 1)
                                )}&to=${ymd(now)}`
                              )
                            }
                          }
                        : undefined
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      cursor: d.id !== null ? 'pointer' : undefined,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: d.color,
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
                      {d.name}
                    </span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(d.value)}
                    </span>
                    <span
                      className="num"
                      style={{ color: 'var(--text-dim)', width: 44, flexShrink: 0 }}
                    >
                      {totalSpend > 0 ? formatPercent((d.value / totalSpend) * 100) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No spending data yet"
              hint="Categorized transactions will show up here"
            />
          )}
        </div>
      </div>

      {/* ---------- Row 3: upcoming + accounts ---------- */}
      <div className="grid-2">
        <div className="card">
          <div style={cardHeaderStyle}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              Upcoming
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddOpen(true)}
              >
                + Add
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn-sm${forecast.isPending ? ' is-loading' : ''}`}
                disabled={forecast.isPending}
                onClick={() => forecast.mutate()}
              >
                Run forecast
              </button>
            </div>
          </div>
          {upcoming.isLoading ? (
            <Skeleton height={20} count={5} />
          ) : upcoming.isError ? (
            <EmptyState title="Couldn't load data" hint={upcoming.error.message} />
          ) : upcomingRows.length ? (
            upcomingRows.map((p, i) => (
              <div
                key={p.id}
                style={{
                  ...ROW_STYLE,
                  borderBottom: i === upcomingRows.length - 1 ? 'none' : ROW_STYLE.borderBottom,
                }}
              >
                <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {fmtDate(new Date(p.predictedDate))}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.notes ?? (p.type === 'recurring' ? 'Recurring' : 'Forecast')}
                </span>
                <span className="num" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {formatMoney(p.predictedAmount)}
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              title="No upcoming transactions"
              hint="Run a forecast to predict what's coming"
            />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Accounts</h2>
          {balances.isLoading ? (
            <Skeleton height={20} count={4} />
          ) : balances.isError ? (
            <EmptyState title="Couldn't load data" hint={balances.error.message} />
          ) : balances.data?.length ? (
            balances.data.map((a, i) => (
              <div
                key={a.id}
                style={{
                  ...ROW_STYLE,
                  borderBottom:
                    i === (balances.data?.length ?? 0) - 1 ? 'none' : ROW_STYLE.borderBottom,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.name} <span style={{ color: 'var(--text-dim)' }}>{a.currency}</span>
                </span>
                <span
                  className="num"
                  style={{
                    fontWeight: 600,
                    color: a.balance >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {formatMoney(a.balance, a.currency)}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="No accounts yet" hint="Add an account to start tracking" />
          )}
        </div>
      </div>

      {/* ---------- Row 4: recent activity ---------- */}
      <div className="card">
        <div style={cardHeaderStyle}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Recent activity
          </h2>
          <Link to="/transactions" style={{ fontSize: 13, fontWeight: 500 }}>
            View all →
          </Link>
        </div>
        {recent.isLoading ? (
          <Skeleton height={20} count={6} />
        ) : recent.isError ? (
          <EmptyState title="Couldn't load data" hint={recent.error.message} />
        ) : recent.data?.length ? (
          recent.data.slice(0, 8).map((t, i, arr) => {
            const signed = t.type === 'debit' ? -t.amount : t.amount
            return (
              <div
                key={t.id}
                style={{
                  ...ROW_STYLE,
                  borderBottom: i === arr.length - 1 ? 'none' : ROW_STYLE.borderBottom,
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
                </span>
                <span
                  className="num"
                  style={{
                    fontWeight: 600,
                    color: signed < 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {formatSignedMoney(signed)}
                </span>
              </div>
            )
          })
        ) : (
          <EmptyState title="No transactions yet" hint="Imported transactions will show up here" />
        )}
      </div>

      <Modal
        open={addOpen}
        title="Add anticipated expense"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary${createAnticipated.isPending ? ' is-loading' : ''}`}
              disabled={createAnticipated.isPending}
              onClick={handleAddAnticipated}
            >
              Save
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="field">
            <label>Account</label>
            <select
              className="select"
              value={anticipatedForm.accountId}
              onChange={e => setAnticipatedForm(f => ({ ...f, accountId: e.target.value }))}
            >
              <option value="">Select account…</option>
              {(balances.data ?? []).map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount</label>
            <input
              type="number"
              className="input"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={anticipatedForm.amount}
              onChange={e => setAnticipatedForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              className="input"
              value={anticipatedForm.date}
              onChange={e => setAnticipatedForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Category (optional)</label>
            <select
              className="select"
              value={anticipatedForm.categoryId}
              onChange={e => setAnticipatedForm(f => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">No category</option>
              {(categories.data ?? []).map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Rent, Insurance…"
              value={anticipatedForm.notes}
              onChange={e => setAnticipatedForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
