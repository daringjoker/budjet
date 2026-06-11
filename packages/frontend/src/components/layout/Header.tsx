import { useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budgets': 'Budgets',
  '/recurring': 'Recurring',
  '/reports': 'Reports',
}

export default function Header() {
  const { pathname } = useLocation()
  return (
    <header style={{ height: 60, background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
        {TITLES[pathname] ?? 'Budjet'}
      </h1>
    </header>
  )
}
