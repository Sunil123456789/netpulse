import { useState } from 'react'
import RangePicker from '../../components/ui/RangePicker.jsx'
import { useAuthStore } from '../../store/authStore'
import { C } from './constants'
import ActiveTabContent from './components/ActiveTabContent.jsx'
import { ProviderBadge, Toast } from './components/Common.jsx'
import { useAIStatus } from './hooks/useAIStatus.js'
import { useAITabs } from './hooks/useAITabs.js'
import { useAIToasts } from './hooks/useAIToasts.js'
/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function AIPage() {
  const user = useAuthStore(s => s.user)
  const [range, setRange] = useState({ type: 'preset', value: '1h', label: '1h' })
  const { tab, setTab, visibleTabs, activeTab } = useAITabs(user)
  const { toasts, addToast } = useAIToasts()
  const {
    configs,
    setConfigs,
    providerStatus,
    ollamaStatus,
    schedulerStatus,
    setSchedulerStatus,
    loading,
    error,
    fetchAll,
    activeProvider,
  } = useAIStatus()

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>AI Intelligence Center</span>
          {activeProvider && <ProviderBadge provider={activeProvider} />}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, color: C.green, background: 'rgba(34,211,160,0.08)', border: '1px solid rgba(34,211,160,0.2)', padding: '3px 9px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, background: C.green, borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            LIVE
          </span>
        </div>
        <RangePicker range={range} onChange={setRange} />
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500, borderRadius: '8px 8px 0 0', background: tab === t.id ? 'var(--bg3)' : 'transparent', color: tab === t.id ? C.accent2 : C.text3, borderBottom: tab === t.id ? `2px solid ${C.accent2}` : '2px solid transparent', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, overflow: tab === 'chat' ? 'hidden' : 'auto', padding: 16, display: tab === 'chat' ? 'flex' : 'block', flexDirection: 'column' }}>
        {loading && <div style={{ color: C.text3, fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading AI status…</div>}
        {error && !loading && (
          <div style={{ background: 'rgba(245,83,79,0.08)', border: '1px solid rgba(245,83,79,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: C.red, fontFamily: 'var(--mono)', fontSize: 11 }}>
            ⚠ {error}
          </div>
        )}
        {!loading && (
          <ActiveTabContent
            tab={tab}
            activeTab={activeTab}
            range={range}
            setRange={setRange}
            configs={configs}
            setConfigs={setConfigs}
            providerStatus={providerStatus}
            ollamaStatus={ollamaStatus}
            schedulerStatus={schedulerStatus}
            setSchedulerStatus={setSchedulerStatus}
            addToast={addToast}
            onRefresh={fetchAll}
          />
        )}
      </div>

      <Toast toasts={toasts} />
    </div>
  )
}




