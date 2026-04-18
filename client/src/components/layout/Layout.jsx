import { useState, useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  const [fullscreen, setFullscreen] = useState(false)
  const toggle = useCallback(() => setFullscreen(f => !f), [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreen])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {!fullscreen && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!fullscreen && <Topbar />}
        <main style={{ flex: 1, overflowY: 'auto', padding: fullscreen ? 0 : '16px 20px' }}>
          <Outlet />
        </main>
      </div>

      {/* Fullscreen toggle — fixed bottom-right, subtle until hovered */}
      <button
        onClick={toggle}
        title={fullscreen ? 'Exit fullscreen  (Esc)' : 'Fullscreen'}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          width: 30,
          height: 30,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: fullscreen ? 'var(--bg4)' : 'var(--bg3)',
          color: fullscreen ? 'var(--text2)' : 'var(--text3)',
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fullscreen ? 0.85 : 0.45,
          transition: 'opacity 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = fullscreen ? '0.85' : '0.45' }}
      >
        {fullscreen ? '⤡' : '⤢'}
      </button>
    </div>
  )
}
