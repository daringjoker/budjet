import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc.js'
import { useToast } from './ui/Toast.js'
import {
  IconDashboard,
  IconTransactions,
  IconAccounts,
  IconBudgets,
  IconRecurring,
  IconReports,
  IconPlus,
  type IconProps,
} from './icons.js'
import { formatSignedMoney } from '../lib/format.js'
import { useCalendar } from '../lib/calendar.js'

/** Simple sparkle, used for the Insights nav entry. */
function IconSparkle({ size = 17, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
      <path d="M19 15v4" />
      <path d="M17 17h4" />
    </svg>
  )
}

const NAV_ITEMS: Array<{ label: string; to: string; Icon: (p: IconProps) => ReactNode }> = [
  { label: 'Dashboard', to: '/dashboard', Icon: IconDashboard },
  { label: 'Transactions', to: '/transactions', Icon: IconTransactions },
  { label: 'Accounts', to: '/accounts', Icon: IconAccounts },
  { label: 'Budgets', to: '/budgets', Icon: IconBudgets },
  { label: 'Recurring', to: '/recurring', Icon: IconRecurring },
  { label: 'Reports', to: '/reports', Icon: IconReports },
  { label: 'Insights', to: '/insights', Icon: IconSparkle },
]

/** One selectable row in the flattened list. */
interface PaletteEntry {
  key: string
  section: 'Go to' | 'Actions' | 'Transactions'
  render: ReactNode
  onSelect: () => void
}

/**
 * Global Cmd+K / Ctrl+K command palette.
 * Mounted once inside the Router; also opens on the `budjet:open-palette`
 * window event (dispatched by the header search hint).
 */
export default function CommandPalette() {
  const navigate = useNavigate()
  const { fmtDate } = useCalendar()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

  const forecast = trpc.predicted.runForecast.useMutation({
    onSuccess: res => toast.success(`Forecast: ${res.predictions} new predictions`),
    onError: err => toast.error(err.message),
  })

  // ----- Global open/close listeners (mounted once) -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(o => (o ? false : o))
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('budjet:open-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('budjet:open-palette', onOpenEvent)
    }
  }, [])

  // Reset state and focus the input each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const trimmed = query.trim()
  const ql = trimmed.toLowerCase()
  const searching = trimmed.length >= 2

  const txQuery = trpc.transactions.list.useQuery(
    { q: trimmed, limit: 8 },
    { enabled: open && searching }
  )

  const close = () => setOpen(false)

  // ----- Build the flattened entry list -----
  const matches = (label: string) => trimmed === '' || label.toLowerCase().includes(ql)

  const entries: PaletteEntry[] = []

  for (const { label, to, Icon } of NAV_ITEMS) {
    if (!matches(label)) continue
    entries.push({
      key: `nav:${to}`,
      section: 'Go to',
      render: (
        <>
          <Icon size={15} />
          <span>{label}</span>
        </>
      ),
      onSelect: () => {
        navigate(to)
        close()
      },
    })
  }

  const actions: Array<{ label: string; icon: ReactNode; hint?: string; run: () => void }> = [
    {
      label: 'Add transaction',
      icon: <IconPlus size={15} />,
      hint: 'manual entry',
      run: () => navigate('/transactions?new=1'),
    },
    {
      label: 'Run forecast',
      icon: <IconRecurring size={15} />,
      run: () => forecast.mutate(),
    },
    {
      label: 'Export transactions (CSV)',
      icon: <IconReports size={15} />,
      run: () => navigate('/transactions?export=1'),
    },
  ]

  for (const a of actions) {
    if (!matches(a.label)) continue
    entries.push({
      key: `action:${a.label}`,
      section: 'Actions',
      render: (
        <>
          {a.icon}
          <span>{a.label}</span>
          {a.hint && <span className="cmdk-item-hint">{a.hint}</span>}
        </>
      ),
      onSelect: () => {
        a.run()
        close()
      },
    })
  }

  if (searching) {
    for (const t of txQuery.data ?? []) {
      const signed = t.type === 'debit' ? -t.amount : t.amount
      entries.push({
        key: `tx:${t.id}`,
        section: 'Transactions',
        render: (
          <>
            <span style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {fmtDate(new Date(t.date))}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
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
                marginLeft: 'auto',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: signed < 0 ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {formatSignedMoney(signed)}
            </span>
          </>
        ),
        onSelect: () => {
          navigate(`/transactions?q=${encodeURIComponent(trimmed)}`)
          close()
        },
      })
    }
  }

  // Clamp the active index whenever the visible list shrinks.
  useEffect(() => {
    setActive(a => Math.min(a, Math.max(entries.length - 1, 0)))
  }, [entries.length])

  // Keep the active item visible while arrowing through the list.
  useEffect(() => {
    if (open) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (entries.length) setActive(a => (a + 1) % entries.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (entries.length) setActive(a => (a - 1 + entries.length) % entries.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      entries[active]?.onSelect()
    }
  }

  if (!open) return null

  // Render entries grouped by section, preserving flattened indexes.
  let lastSection: string | null = null
  itemRefs.current.length = entries.length

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Search transactions or type a command…"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onInputKeyDown}
          autoFocus
          spellCheck={false}
        />
        <div className="cmdk-list">
          {entries.map((entry, i) => {
            const header =
              entry.section !== lastSection ? (
                <div className="cmdk-section">{entry.section}</div>
              ) : null
            lastSection = entry.section
            return (
              <div key={entry.key}>
                {header}
                <div
                  ref={el => {
                    itemRefs.current[i] = el
                  }}
                  className={`cmdk-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={entry.onSelect}
                >
                  {entry.render}
                </div>
              </div>
            )
          })}
          {entries.length === 0 && (
            <div className="cmdk-empty">
              {searching && txQuery.isLoading
                ? 'Searching…'
                : `No results for “${trimmed}”`}
            </div>
          )}
        </div>
        <div className="cmdk-footer">
          <span>↑↓ navigate</span>
          <span>·</span>
          <span>↵ select</span>
          <span>·</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
