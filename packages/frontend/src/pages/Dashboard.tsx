import { trpc } from '../trpc.js'
import { Link } from 'react-router-dom'
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
import { formatDate, formatMoney, formatPercent, formatSignedMoney } from '../lib/format.js'

const TOOLTIP_STYLE = {
  background: '#1a2540',
  border: '1px solid #243049',
  borderRadius: 8,
} as const

const TOOLTIP_TEXT = { color: '#e6ebf4' } as const

/** "2026-04" → "Apr" */
function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const summary = trpc.reports.summary.useQuery({ from, to })
  const trend = trpc.reports.trend.useQuery({ months: 4 })
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

  // ----- This-month stats + vs-last-month deltas (from trend) -----
  const income = summary.data?.totalIn ?? 0
  const spending = summary.data?.totalOut ?? 0
  const net = summary.data?.net ?? 0
  const savingsRate = income > 0 ? (net / income) * 100 : null

  const currKey = monthKey(now)
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
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
    ...topCategories.map(c => ({ name: c.categoryName, value: c.total, color: c.categoryColor })),
    ...(othersTotal > 0 ? [{ name: 'Others', value: othersTotal, color: '#5d6b85' }] : []),
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
                  tickFormatter={monthLabel}
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
                  labelFormatter={(m) => monthLabel(String(m))}
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
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
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
            <button
              type="button"
              className={`btn btn-ghost btn-sm${forecast.isPending ? ' is-loading' : ''}`}
              disabled={forecast.isPending}
              onClick={() => forecast.mutate()}
            >
              Run forecast
            </button>
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
                  {formatDate(new Date(p.predictedDate))}
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
                  {formatDate(new Date(t.date))}
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
    </div>
  )
}
