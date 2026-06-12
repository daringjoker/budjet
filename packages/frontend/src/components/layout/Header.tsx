import { useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budgets': 'Budgets',
  '/recurring': 'Recurring',
  '/reports': 'Reports',
  '/insights': 'Insights',
  '/rules': 'Rules',
}

const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform)

export default function Header() {
  const { pathname } = useLocation()
  return (
    <header className="app-header">
      <h1>{TITLES[pathname] ?? 'Budjet'}</h1>
      <button
        type="button"
        title="Open command palette"
        onClick={() => window.dispatchEvent(new Event('budjet:open-palette'))}
        style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-strong)',
          background: 'var(--bg)',
          color: 'var(--text-dim)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search</span>
        <span className="cmdk-kbd">{IS_MAC ? '⌘K' : 'Ctrl K'}</span>
      </button>
    </header>
  )
}
