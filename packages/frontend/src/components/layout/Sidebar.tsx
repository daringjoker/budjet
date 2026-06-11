import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/dashboard', label: '⬡ Dashboard' },
  { to: '/transactions', label: '↔ Transactions' },
  { to: '/accounts', label: '◈ Accounts' },
  { to: '/budgets', label: '◎ Budgets' },
  { to: '/recurring', label: '↺ Recurring' },
  { to: '/reports', label: '▦ Reports' },
]

export default function Sidebar() {
  return (
    <nav style={{ width: 220, background: '#1e293b', padding: '24px 16px', borderRight: '1px solid #334155' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#818cf8', marginBottom: 32, padding: '0 8px' }}>
        budjet
      </div>
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
          display: 'block', padding: '10px 12px', marginBottom: 4, borderRadius: 8,
          textDecoration: 'none', fontSize: 14, fontWeight: 500,
          color: isActive ? '#818cf8' : '#94a3b8',
          background: isActive ? '#1e1b4b' : 'transparent',
        })}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}
