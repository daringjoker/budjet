import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Skeleton from '../components/ui/Skeleton.js'
import EmptyState from '../components/ui/EmptyState.js'
import { formatMoney, formatPercent, formatSignedMoney } from '../lib/format.js'

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

/** Local "yyyy-mm-dd" (avoids UTC shift from toISOString) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

type PresetKey = 'this-month' | 'last-month' | 'last-3-months' | 'this-year'

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'last-3-months', label: 'Last 3 months' },
  { key: 'this-year', label: 'This year' },
]

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (key) {
    case 'this-month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) }
    case 'last-month':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case 'last-3-months':
      return { from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m + 1, 0)) }
    case 'this-year':
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) }
  }
}

/** Clickable wrapper for a category breakdown row (subtle hover bg). */
function CategoryRow({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        borderRadius: 8,
        padding: '6px 8px',
        margin: '-6px -8px',
        background: hover ? 'rgba(109, 124, 255, 0.08)' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      {children}
    </div>
  )
}

export default function Reports() {
  const navigate = useNavigate()
  const initial = presetRange('this-month')
  const [preset, setPreset] = useState<PresetKey | null>('this-month')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)

  const fromISO = new Date(from).toISOString()
  const toISO = new Date(to).toISOString()

  const summary = trpc.reports.summary.useQuery({ from: fromISO, to: toISO })
  const breakdown = trpc.reports.categoryBreakdown.useQuery({ from: fromISO, to: toISO })
  const merchants = trpc.reports.topMerchants.useQuery({ from: fromISO, to: toISO, limit: 10 })
  const trend = trpc.reports.trend.useQuery({ months: 6 })

  const net = summary.data?.net ?? 0
  const totalSpend = breakdown.data?.reduce((acc, c) => acc + c.total, 0) ?? 0

  const applyPreset = (key: PresetKey) => {
    const range = presetRange(key)
    setPreset(key)
    setFrom(range.from)
    setTo(range.to)
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ---------- Toolbar: preset chips + custom range ---------- */}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignSelf: 'flex-end' }}>
          {PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="field">
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            type="date"
            className="input"
            value={from}
            onChange={e => {
              if (e.target.value) {
                setFrom(e.target.value)
                setPreset(null)
              }
            }}
          />
        </div>
        <span style={{ color: 'var(--text-dim)', alignSelf: 'flex-end', paddingBottom: 8 }}>→</span>
        <div className="field">
          <label htmlFor="report-to">To</label>
          <input
            id="report-to"
            type="date"
            className="input"
            value={to}
            onChange={e => {
              if (e.target.value) {
                setTo(e.target.value)
                setPreset(null)
              }
            }}
          />
        </div>
      </div>

      {/* ---------- Stat cards ---------- */}
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
              <div className="stat-value pos">{formatMoney(summary.data?.totalIn ?? 0)}</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Spending</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value neg">{formatMoney(summary.data?.totalOut ?? 0)}</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Net</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className={`stat-value ${net >= 0 ? 'pos' : 'neg'}`}>
                {formatSignedMoney(net)}
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Transactions</div>
            {summary.isLoading ? (
              <Skeleton height={30} width="70%" />
            ) : (
              <div className="stat-value accent">
                {(summary.data?.transactionCount ?? 0).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Category bars + top merchants ---------- */}
      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Spending by category</h2>
          {breakdown.isLoading ? (
            <Skeleton height={24} count={6} />
          ) : breakdown.isError ? (
            <EmptyState title="Couldn't load data" hint={breakdown.error.message} />
          ) : breakdown.data?.length ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {breakdown.data.map(c => {
                const share = totalSpend > 0 ? (c.total / totalSpend) * 100 : 0
                return (
                  <CategoryRow
                    key={c.categoryId}
                    onClick={() =>
                      navigate(`/transactions?category=${c.categoryId}&from=${from}&to=${to}`)
                    }
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        fontSize: 13,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                      >
                        {c.categoryName}
                      </span>
                      <span className="num" style={{ fontWeight: 600 }}>
                        {formatMoney(c.total)}
                      </span>
                      <span
                        className="num"
                        style={{ color: 'var(--text-dim)', width: 44, flexShrink: 0 }}
                      >
                        {formatPercent(share)}
                      </span>
                      <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>→</span>
                    </div>
                    <div className="progress">
                      <div
                        className="progress-fill"
                        style={{ width: `${share}%`, backgroundColor: c.categoryColor }}
                      />
                    </div>
                  </CategoryRow>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="No data for this period"
              hint="Categorized spending will show up here"
            />
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Top merchants</h2>
          {merchants.isLoading ? (
            <Skeleton height={24} count={6} />
          ) : merchants.isError ? (
            <EmptyState title="Couldn't load data" hint={merchants.error.message} />
          ) : merchants.data?.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th className="num">Times</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.data.map(m => (
                    <tr key={m.description}>
                      <td
                        style={{
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.isMerchant ? (
                          <span className="badge" title={m.description}>
                            {m.description}
                          </span>
                        ) : (
                          m.description
                        )}
                      </td>
                      <td className="num" style={{ color: 'var(--text-muted)' }}>
                        {m.count}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {formatMoney(m.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No data for this period"
              hint="Debit transactions will show up here"
            />
          )}
        </div>
      </div>

      {/* ---------- Cash flow trend (last 6 months) ---------- */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Cash flow{' '}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-dim)' }}>
              last 6 months
            </span>
          </h2>
          <div style={{ display: 'flex', gap: 14 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2dd4a7' }} />
              In
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b7a' }} />
              Out
            </span>
          </div>
        </div>
        {trend.isLoading ? (
          <Skeleton height={240} />
        ) : trend.isError ? (
          <EmptyState title="Couldn't load data" hint={trend.error.message} />
        ) : trend.data?.length ? (
          <ResponsiveContainer width="100%" height={240}>
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
    </div>
  )
}
