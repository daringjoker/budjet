import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar.js'
import Header from './components/layout/Header.js'
import Spinner from './components/ui/Spinner.js'
import CommandPalette from './components/CommandPalette.js'
import { Rules } from './pages/Rules.js'

const Dashboard = lazy(() => import('./pages/Dashboard.js'))
const Transactions = lazy(() => import('./pages/Transactions.js'))
const Accounts = lazy(() => import('./pages/Accounts.js'))
const Budgets = lazy(() => import('./pages/Budgets.js'))
const Recurring = lazy(() => import('./pages/Recurring.js'))
const Reports = lazy(() => import('./pages/Reports.js'))
const Insights = lazy(() => import('./pages/Insights.js'))

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <div className="app-content">
          <Header />
          <main className="app-main">
            <Suspense fallback={<Spinner center />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/recurring" element={<Recurring />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/rules" element={<Rules />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPalette />
    </BrowserRouter>
  )
}
