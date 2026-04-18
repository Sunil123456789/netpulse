import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import NetPulseLogo from '../ui/NetPulseLogo.jsx'
import { getVisibleNavItems } from '../../config/access'

const PINNED_KEY = 'netpulse.sidebar.pinned'
const readPinned = () => { try { return localStorage.getItem(PINNED_KEY) === 'true' } catch { return false } }

export default function Sidebar() {
  const { logout, user } = useAuthStore()
  const visibleNav = getVisibleNavItems(user)
  const [pinned, setPinned] = useState(readPinned)
  const [hovered, setHovered] = useState(false)

  const expanded = pinned || hovered
  const W = expanded ? 200 : 64

  useEffect(() => { localStorage.setItem(PINNED_KEY, String(pinned)) }, [pinned])

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: W, flexShrink: 0,
        background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 12, paddingBottom: 12, gap: 4,
        overflow: 'hidden',
        transition: 'width 200ms ease',
      }}
    >
      {/* Logo */}
      <div style={{
        marginBottom: 16, display: 'flex', alignItems: 'center', width: '100%',
        paddingLeft: expanded ? 12 : 10, transition: 'padding 200ms ease',
      }}>
        <NetPulseLogo size={28} />
        <span style={{
          overflow: 'hidden', maxWidth: expanded ? 110 : 0, opacity: expanded ? 1 : 0,
          transition: 'max-width 200ms ease, opacity 150ms ease',
          marginLeft: 8, fontFamily: 'var(--sans)', fontWeight: 800, fontSize: 13,
          background: 'linear-gradient(90deg,#4f7ef5,#7c5cfc)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          whiteSpace: 'nowrap',
        }}>NetPulse</span>
      </div>

      {/* Nav items */}
      {visibleNav.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          title={expanded ? undefined : item.navLabel}
          style={({ isActive }) => ({
            width: expanded ? 176 : 44, height: 40, borderRadius: 10,
            display: 'flex', alignItems: 'center',
            justifyContent: expanded ? 'flex-start' : 'center',
            paddingLeft: expanded ? 12 : 0, gap: expanded ? 10 : 0,
            fontSize: 16, textDecoration: 'none',
            transition: 'all 200ms ease',
            background: isActive ? 'var(--bg4)' : 'transparent',
            border: isActive ? '1px solid var(--border2)' : '1px solid transparent',
            flexShrink: 0,
          })}
        >
          <span style={{ flexShrink: 0 }}>{item.icon}</span>
          <span style={{
            overflow: 'hidden', maxWidth: expanded ? 120 : 0, opacity: expanded ? 1 : 0,
            transition: 'max-width 200ms ease, opacity 150ms ease',
            fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 500,
            color: 'var(--text)', whiteSpace: 'nowrap',
          }}>{item.navLabel}</span>
        </NavLink>
      ))}

      {/* Pin toggle */}
      <button
        onClick={() => setPinned(p => !p)}
        title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
        style={{
          width: expanded ? 176 : 40, height: 28, borderRadius: 8,
          border: '1px solid var(--border)',
          background: pinned ? 'var(--bg4)' : 'transparent',
          color: pinned ? 'var(--text2)' : 'var(--text3)',
          cursor: 'pointer', fontSize: 10,
          display: 'flex', alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          paddingLeft: expanded ? 12 : 0, gap: expanded ? 8 : 0,
          transition: 'all 200ms ease', marginTop: 4, flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9 }}>{pinned ? '◀' : '▶'}</span>
        <span style={{
          overflow: 'hidden', maxWidth: expanded ? 100 : 0, opacity: expanded ? 1 : 0,
          transition: 'max-width 200ms ease, opacity 150ms ease',
          fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
        }}>{pinned ? 'Unpin' : 'Pin open'}</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Logout */}
      <button
        onClick={logout}
        title={expanded ? undefined : 'Logout'}
        style={{
          width: expanded ? 176 : 44, height: 40, borderRadius: 10,
          border: 'none', background: 'transparent', color: 'var(--text3)',
          cursor: 'pointer', fontSize: 16,
          display: 'flex', alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          paddingLeft: expanded ? 12 : 0, gap: expanded ? 10 : 0,
          transition: 'all 200ms ease',
        }}
      >
        <span>⏏</span>
        <span style={{
          overflow: 'hidden', maxWidth: expanded ? 100 : 0, opacity: expanded ? 1 : 0,
          transition: 'max-width 200ms ease, opacity 150ms ease',
          fontSize: 11, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
        }}>Logout</span>
      </button>
    </aside>
  )
}
