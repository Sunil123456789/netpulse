import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/layout/Layout'
import { canAccessPath } from './config/access'

const LoginPage = lazy(() => import('./pages/Login/LoginPage'))
const SOCPage = lazy(() => import('./pages/SOC/SOCPage'))
const NOCPage = lazy(() => import('./pages/NOC/NOCPage'))
const AdminPage = lazy(() => import('./pages/Admin/AdminPage'))
const TicketsPage = lazy(() => import('./pages/Tickets/TicketsPage'))
const ReportsPage = lazy(() => import('./pages/Reports/ReportsPage'))
const AIPage = lazy(() => import('./pages/AI/AIPage'))
const EDRPage = lazy(() => import('./pages/EDR/EDRPage'))
const HomePage = lazy(() => import('./pages/Home/HomePage'))
const ZabbixPage = lazy(() => import('./pages/Zabbix/ZabbixPage'))

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function AccessRoute({ children, path }) {
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  if (!token) return <Navigate to="/login" replace />
  return canAccessPath(path, user) ? children : <Navigate to="/home" replace />
}

function PageLoader() {
  return (
    <div style={{ padding: 20, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
      Loading page…
    </div>
  )
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LazyPage><LoginPage /></LazyPage>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home"    element={<LazyPage><HomePage /></LazyPage>} />
        <Route path="soc"     element={<LazyPage><SOCPage /></LazyPage>} />
        <Route path="noc"     element={<LazyPage><NOCPage /></LazyPage>} />
        <Route path="tickets" element={<AccessRoute path="/tickets"><LazyPage><TicketsPage /></LazyPage></AccessRoute>} />
        <Route path="admin"   element={<AccessRoute path="/admin"><LazyPage><AdminPage /></LazyPage></AccessRoute>} />
        <Route path="reports" element={<AccessRoute path="/reports"><LazyPage><ReportsPage /></LazyPage></AccessRoute>} />
        <Route path="ai"      element={<LazyPage><AIPage /></LazyPage>} />
        <Route path="edr"     element={<LazyPage><EDRPage /></LazyPage>} />
        <Route path="zabbix"  element={<LazyPage><ZabbixPage /></LazyPage>} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
