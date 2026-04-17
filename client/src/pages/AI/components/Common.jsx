import { C } from '../constants'

export function Card({ title, badge, badgeClass = 'blue', children, noPad, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge !== undefined && <span className={`badge badge-${badgeClass}`}>{badge}</span>}
      </div>
      <div style={noPad ? {} : { padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

export function ProviderBadge({ provider }) {
  const map = {
    claude: { label: 'Claude', color: C.accent2 },
    openai: { label: 'OpenAI', color: C.green },
    ollama: { label: 'Ollama', color: C.amber },
    template: { label: 'Template', color: C.cyan },
  }
  const p = map[provider] || { label: provider || 'Unknown', color: C.text3 }

  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 10px',
        borderRadius: 20,
        fontFamily: 'var(--mono)',
        fontWeight: 600,
        background: `${p.color}1a`,
        color: p.color,
        border: `1px solid ${p.color}44`,
      }}
    >
      {p.label}
    </span>
  )
}

export function TabPlaceholder({ tab }) {
  return (
    <Card title={tab.label}>
      <div style={{ padding: 32, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 12 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{tab.icon}</div>
        <div style={{ color: C.text2 }}>{tab.label} — Coming in next step</div>
      </div>
    </Card>
  )
}

export function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontFamily: 'var(--mono)',
            animation: 'fadeIn 0.2s ease',
            background: t.type === 'error' ? 'rgba(245,83,79,0.18)' : 'rgba(34,211,160,0.15)',
            color: t.type === 'error' ? C.red : C.green,
            border: `1px solid ${t.type === 'error' ? 'rgba(245,83,79,0.4)' : 'rgba(34,211,160,0.3)'}`,
          }}
        >
          {t.type === 'error' ? '✕' : '✓'} {t.msg}
        </div>
      ))}
    </div>
  )
}
