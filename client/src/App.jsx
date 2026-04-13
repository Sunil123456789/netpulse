import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/layout/Layout'
import LoginPage from './pages/Login/LoginPage'
import SOCPage from './pages/SOC/SOCPage'
import NOCPage from './pages/NOC/NOCPage'
import AdminPage from './pages/Admin/AdminPage'
import TicketsPage from './pages/Tickets/TicketsPage'
import ReportsPage from './pages/Reports/ReportsPage'
import AIPage from './pages/AI/AIPage'
import EDRPage from './pages/EDR/EDRPage'
import HomePage from './pages/Home/HomePage'
import ZabbixPage from './pages/Zabbix/ZabbixPage'
function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home"    element={<HomePage />} />
        <Route path="soc"     element={<SOCPage />} />
        <Route path="noc"     element={<NOCPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="admin"   element={<AdminPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="ai"      element={<AIPage />} />
        <Route path="edr"     element={<EDRPage />} />
        <Route path="zabbix"  element={<ZabbixPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
