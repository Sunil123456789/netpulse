import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import NetPulseLogo from '../ui/NetPulseLogo.jsx'
import { getVisibleNavItems } from '../../config/access'
export default function Sidebar() {
  const { logout, user } = useAuthStore()
  const visibleNav = getVisibleNavItems(user)
  return (
    <aside style={{ width:64, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', paddingTop:12, paddingBottom:12, gap:4 }}>
      <div style={{ marginBottom:16 }}><NetPulseLogo size={36} /></div>
      {visibleNav.map(item => (
        <NavLink key={item.path} to={item.path} title={item.navLabel} style={({ isActive }) => ({ width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, textDecoration:'none', transition:'all 0.15s', background: isActive ? 'var(--bg4)' : 'transparent', border: isActive ? '1px solid var(--border2)' : '1px solid transparent' })}>
          {item.icon}
        </NavLink>
      ))}
      <div style={{ flex:1 }} />
      <button onClick={logout} title="Logout" style={{ width:44, height:44, borderRadius:10, border:'none', background:'transparent', color:'var(--text3)', cursor:'pointer', fontSize:18 }}>⏏</button>
    </aside>
  )
}

