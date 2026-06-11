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
    <header className="app-header">
      <h1>{TITLES[pathname] ?? 'Budjet'}</h1>
    </header>
  )
}
