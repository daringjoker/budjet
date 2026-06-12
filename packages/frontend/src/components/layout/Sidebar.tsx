import { NavLink } from 'react-router-dom'
import {
  IconDashboard,
  IconTransactions,
  IconAccounts,
  IconBudgets,
  IconRecurring,
  IconReports,
  IconInsights,
  IconRules,
} from '../icons.js'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/transactions', label: 'Transactions', Icon: IconTransactions },
  { to: '/accounts', label: 'Accounts', Icon: IconAccounts },
  { to: '/budgets', label: 'Budgets', Icon: IconBudgets },
  { to: '/recurring', label: 'Recurring', Icon: IconRecurring },
  { to: '/reports', label: 'Reports', Icon: IconReports },
  { to: '/insights', label: 'Insights', Icon: IconInsights },
  { to: '/rules', label: 'Rules', Icon: IconRules },
]

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-mark">B</span>
        <span className="logo-text">budjet</span>
      </div>
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <Icon />
          <span className="nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
