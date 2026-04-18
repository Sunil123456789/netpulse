import React, { useState } from 'react'
import RangePicker from '../../components/ui/RangePicker.jsx'
import { useAuthStore } from '../../store/authStore'
import { C } from './constants'
import ActiveTabContent from './components/ActiveTabContent.jsx'
import { ProviderBadge, Toast } from './components/Common.jsx'
import { useAIStatus } from './hooks/useAIStatus.js'
import { useAITabs } from './hooks/useAITabs.js'
import { useAIToasts } from './hooks/useAIToasts.js'

const NO_PAD_TABS = ['chat', 'benchmark']

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function AIPage() {
  const user = useAuthStore(s => s.user)
  const [range, setRange] = useState({ type: 'preset', value: '1h', label: '1h' })
  const { section, tab, setTabDirect, visibleSections, activeSection, activeTab } = useAITabs(user)
  const flatTabs = visibleSections.flatMap(sec => sec.tabs.map(t => ({ ...t, sectionId: sec.id })))
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

  const isNoPad = NO_PAD_TABS.includes(activeTab?.id)

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{activeSection?.icon || '🧠'}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>AI & ML Intelligence Center</span>
          {activeProvider && <ProviderBadge provider={activeProvider} />}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, color: C.green, background: 'rgba(34,211,160,0.08)', border: '1px solid rgba(34,211,160,0.2)', padding: '3px 9px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, background: C.green, borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            LIVE
          </span>
        </div>
        {section !== 'settings' && <RangePicker range={range} onChange={setRange} />}
      </div>

      {/* flat single-row tabs */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto', padding: '0 16px' }}>
        {flatTabs.map((t, idx) => {
          const isActive = t.id === activeTab?.id && t.sectionId === section
          const prevTab = flatTabs[idx - 1]
          const showDivider = idx > 0 && prevTab.sectionId !== t.sectionId
          return (
            <React.Fragment key={`${t.sectionId}:${t.id}`}>
              {showDivider && (
                <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, margin: '0 8px' }} />
              )}
              <button
                onClick={() => setTabDirect(t.sectionId, t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '9px 12px',
                  border: 'none', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'var(--mono)', fontWeight: isActive ? 700 : 500,
                  borderRadius: 0, background: 'transparent',
                  color: isActive ? C.accent2 : C.text3,
                  borderBottom: isActive ? `2px solid ${C.accent2}` : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                <span>{t.icon}</span><span>{t.label}</span>
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {/* content */}
      <div style={{
        flex: 1,
        overflow: isNoPad ? 'hidden' : 'auto',
        padding: isNoPad ? 0 : 16,
        display: isNoPad ? 'flex' : 'block',
        flexDirection: 'column',
      }}>
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
