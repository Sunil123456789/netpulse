import { useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { NetPulseLogoFull } from '../ui/NetPulseLogo.jsx'
import { getPageTitle } from '../../config/access'
export default function Topbar() {
  const { pathname } = useLocation()
  const { user } = useAuthStore()
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  const title = getPageTitle(pathname, user)
  return (
    <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', background:'var(--bg2)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <NetPulseLogoFull iconSize={28} />
        <div style={{ width:1, height:28, background:'var(--border)' }} />
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{title}</div>
          <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>netpulse.local</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:11, color:'var(--green)', background:'rgba(34,211,160,0.08)', border:'1px solid rgba(34,211,160,0.2)', padding:'4px 10px', borderRadius:20 }}>
          <div style={{ width:6, height:6, background:'var(--green)', borderRadius:'50%', animation:'pulse 2s infinite' }} />
          LIVE
        </div>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>
          {time.toLocaleString('en', { weekday:'short', year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', timeZoneName:'short' })}
        </div>
        <div style={{ width:30, height:30, borderRadius:8, background:'var(--bg4)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'var(--accent)', fontFamily:'var(--mono)', fontWeight:600 }}>
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
