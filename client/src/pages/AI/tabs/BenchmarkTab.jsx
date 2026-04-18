import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { C } from '../constants'
import { aiAPI } from '../../../api/ai.js'

// ─── Test catalogue ───────────────────────────────────────────────────────────
const ALL_TESTS = [
  {
    id: 'speed',
    name: 'Speed',
    icon: '⚡',
    desc: 'Raw latency — minimal output',
    type: 'contains',
    expected: 'done',
    prompt: 'Reply with exactly one word: DONE',
  },
  {
    id: 'math',
    name: 'Math',
    icon: '🔢',
    desc: 'Arithmetic accuracy',
    type: 'exact',
    expected: '391',
    prompt: 'Calculate 17 × 23. Reply with only the number, nothing else.',
  },
  {
    id: 'logic',
    name: 'Logic',
    icon: '🧠',
    desc: 'Deductive reasoning',
    type: 'contains',
    expected: 'yes',
    prompt: 'All cats are animals. All animals need water. Do cats need water? Reply Yes or No only.',
  },
  {
    id: 'code',
    name: 'Code',
    icon: '💻',
    desc: 'Code generation',
    type: 'code',
    expected: null,
    prompt: 'Write a Python one-liner to reverse a string s. Only the code, no explanation.',
  },
  {
    id: 'instruction',
    name: 'Format',
    icon: '📋',
    desc: 'Instruction following',
    type: 'format_list',
    expected: null,
    prompt: 'List 3 primary colors. Numbered format only:\n1. \n2. \n3. \nNothing else.',
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    icon: '🔍',
    desc: 'Word problem solving',
    type: 'contains',
    expected: '150',
    prompt: 'A train travels at 60 km/h for 2.5 hours. How far does it travel? Reply with the number and unit only.',
  },
  {
    id: 'context',
    name: 'Context',
    icon: '📚',
    desc: 'Context retention',
    type: 'contains',
    expected: 'canberra',
    prompt: "Australia's capital is Canberra, not Sydney. What is Australia's capital? One word only.",
  },
  {
    id: 'summary',
    name: 'Summary',
    icon: '📝',
    desc: 'Summarization quality',
    type: 'length',
    expected: null,
    prompt: 'Summarize in one sentence: Machine learning enables systems to learn from data and improve over time through experience without being explicitly programmed for every task.',
  },
]

// ─── Test suites ──────────────────────────────────────────────────────────────
const SUITES = {
  quick: {
    label: 'Quick',
    desc: '3 tests · ~30s per model',
    tests: ['speed', 'math', 'logic'],
  },
  standard: {
    label: 'Standard',
    desc: '5 tests · ~90s per model',
    tests: ['speed', 'math', 'logic', 'code', 'instruction'],
  },
  advanced: {
    label: 'Advanced',
    desc: '8 tests · ~3 min per model',
    tests: ['speed', 'math', 'logic', 'code', 'instruction', 'reasoning', 'context', 'summary'],
  },
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function computeScores(modelResults, activeTests) {
  const models = Object.keys(modelResults)
  if (models.length === 0) return {}

  // Min latency per test across all finished models
  const minLat = {}
  activeTests.forEach(test => {
    const lats = models
      .map(m => modelResults[m]?.[test.id]?.summary?.avgResponseTimeMs)
      .filter(l => l > 0)
    if (lats.length > 0) minLat[test.id] = Math.min(...lats)
  })

  const scores = {}
  models.forEach(model => {
    const testScores = []
    activeTests.forEach(test => {
      const r = modelResults[model]?.[test.id]
      if (!r?.summary || r.status === 'error' || r.status === 'pending' || r.status === 'running') return
      const lat = r.summary.avgResponseTimeMs || 9_999_999
      const speedScore = Math.round(Math.max(10, ((minLat[test.id] || lat) / lat) * 100))
      const q = r.summary.avgQualityScore
      testScores.push(q != null ? Math.round(speedScore * 0.35 + q * 0.65) : speedScore)
    })
    scores[model] = testScores.length > 0
      ? Math.round(testScores.reduce((a, b) => a + b, 0) / testScores.length)
      : 0
  })
  return scores
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMs(ms) {
  if (!ms && ms !== 0) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function fmtBytes(bytes) {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function scoreColor(s) {
  return s >= 80 ? C.green : s >= 60 ? C.amber : s >= 40 ? C.accent : C.red
}

// ─── Micro-components ─────────────────────────────────────────────────────────
function Chip({ active, onClick, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
        border: `1px solid ${active ? C.accent : 'var(--border)'}`,
        background: active ? `${C.accent}22` : 'var(--bg4)',
        color: active ? C.accent : C.text2,
        fontFamily: 'var(--mono)', fontWeight: active ? 700 : 400,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function MatrixCell({ result }) {
  const base = { padding: '5px 4px', textAlign: 'center', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  if (!result || result.status === 'pending') {
    return <td style={{ ...base, color: C.text3, fontSize: 9, fontFamily: 'var(--mono)' }}>—</td>
  }
  if (result.status === 'running') {
    return (
      <td style={base}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: 'var(--mono)', letterSpacing: 2 }}>···</div>
      </td>
    )
  }
  if (result.status === 'error') {
    return (
      <td style={base}>
        <div style={{ fontSize: 11, color: C.red }}>✗</div>
        <div style={{ fontSize: 8, color: C.red, fontFamily: 'var(--mono)' }}>err</div>
      </td>
    )
  }

  const q = result.summary?.avgQualityScore
  const hasQ = q != null
  const lat = result.summary?.avgResponseTimeMs
  const tps = result.summary?.avgTokensPerSec
  const ttft = result.summary?.avgTtft

  return (
    <td style={base}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {hasQ && (
          <span style={{ fontSize: 13, lineHeight: 1, color: q >= 100 ? C.green : C.red }}>
            {q >= 100 ? '✓' : '✗'}
          </span>
        )}
        <span style={{ fontSize: 9, color: C.cyan, fontFamily: 'var(--mono)' }}>{fmtMs(lat)}</span>
        {ttft > 0 && ttft !== lat && (
          <span style={{ fontSize: 8, color: C.text3, fontFamily: 'var(--mono)' }}>ttft {fmtMs(ttft)}</span>
        )}
        {tps > 0 && (
          <span style={{ fontSize: 8, color: C.green, fontFamily: 'var(--mono)' }}>{tps}t/s</span>
        )}
      </div>
    </td>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BenchmarkTab({ ollamaStatus, addToast }) {
  const [models, setModels]             = useState([])
  const [selected, setSelected]         = useState(new Set())
  const [suiteId, setSuiteId]           = useState('standard')
  const [modelResults, setModelResults] = useState({})
  const [running, setRunning]           = useState(false)
  const [currentModel, setCurrentModel] = useState(null)
  const [currentTest, setCurrentTest]   = useState(null)
  const [progress, setProgress]         = useState({ mi: 0, ti: 0, mt: 0, tt: 0 })
  const [view, setView]                 = useState('matrix')
  const [lastRun, setLastRun]           = useState(null)
  const abortRef = useRef(false)
  const [configOpen, setConfigOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1200)
  const CONFIG_W = 248
  const COLLAPSED_W = 36

  // Derived
  const activeTests = useMemo(() => {
    const ids = SUITES[suiteId]?.tests || []
    return ALL_TESTS.filter(t => ids.includes(t.id))
  }, [suiteId])

  const scores = useMemo(() => computeScores(modelResults, activeTests), [modelResults, activeTests])

  const rankedModels = useMemo(() =>
    Object.keys(modelResults).sort((a, b) => (scores[b] || 0) - (scores[a] || 0)),
    [modelResults, scores]
  )

  // Load models
  useEffect(() => {
    const load = async () => {
      try {
        const res = await aiAPI.getOllamaStatus()
        const list = res.data?.models || []
        setModels(list)
        setSelected(new Set(list.map(m => m.name)))
      } catch {
        if (ollamaStatus?.models?.length) {
          setModels(ollamaStatus.models)
          setSelected(new Set(ollamaStatus.models.map(m => m.name)))
        }
      }
    }
    load()
  }, [])

  const toggleModel = (name) => setSelected(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === models.length ? new Set() : new Set(models.map(m => m.name))
  )

  // Run benchmark — sequential model × sequential test
  const run = useCallback(async () => {
    if (selected.size === 0) return
    setRunning(true)
    setModelResults({})
    abortRef.current = false
    const modelList = [...selected]
    const mt = modelList.length
    const tt = activeTests.length

    for (let mi = 0; mi < modelList.length; mi++) {
      if (abortRef.current) break
      const model = modelList[mi]
      setCurrentModel(model)
      setProgress({ mi: mi + 1, ti: 0, mt, tt })

      // Initialise pending slots for this model
      setModelResults(prev => ({
        ...prev,
        [model]: Object.fromEntries(activeTests.map(t => [t.id, { status: 'pending' }])),
      }))

      for (let ti = 0; ti < activeTests.length; ti++) {
        if (abortRef.current) break
        const test = activeTests[ti]
        setCurrentTest(test)
        setProgress({ mi: mi + 1, ti: ti + 1, mt, tt })

        setModelResults(prev => ({
          ...prev,
          [model]: { ...prev[model], [test.id]: { status: 'running' } },
        }))

        try {
          const res = await aiAPI.benchmarkModel(model, test.prompt, 1, {
            testType: test.type,
            expectedAnswer: test.expected,
          })
          setModelResults(prev => ({
            ...prev,
            [model]: { ...prev[model], [test.id]: { status: 'done', summary: res.data.summary } },
          }))
        } catch (err) {
          setModelResults(prev => ({
            ...prev,
            [model]: {
              ...prev[model],
              [test.id]: { status: 'error', error: err?.response?.data?.error || err.message },
            },
          }))
        }
      }
    }

    setCurrentModel(null)
    setCurrentTest(null)
    setRunning(false)
    setLastRun(new Date())
  }, [selected, activeTests])

  const stop = () => { abortRef.current = true }

  const exportResults = () => {
    const blob = new Blob(
      [JSON.stringify({ suite: suiteId, tests: activeTests.map(t => t.id), scores, results: modelResults }, null, 2)],
      { type: 'application/json' }
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `netpulse-benchmark-${Date.now()}.json`
    a.click()
  }

  const hasResults = Object.keys(modelResults).length > 0
  const canRun = selected.size > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontSize: 12 }}>

      {/* ── Config sidebar ── */}
      <div style={{
        width: configOpen ? CONFIG_W : COLLAPSED_W,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
        transition: 'width 200ms ease',
        position: 'relative',
      }}>
        {/* Toggle arrow */}
        <button
          onClick={() => setConfigOpen(o => !o)}
          title={configOpen ? 'Collapse config' : 'Expand config'}
          style={{
            position: 'absolute', top: 8, right: 6, zIndex: 2,
            width: 22, height: 22, borderRadius: 5,
            border: '1px solid var(--border)', background: 'var(--bg3)',
            color: C.text3, cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: configOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 200ms ease',
            flexShrink: 0,
          }}
        >‹</button>

        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          gap: 12, padding: 14, paddingTop: 40,
          overflowY: 'auto',
          opacity: configOpen ? 1 : 0,
          transition: 'opacity 150ms ease',
          pointerEvents: configOpen ? 'auto' : 'none',
        }}>

        {/* Suite */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, letterSpacing: 1, marginBottom: 8 }}>TEST SUITE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Object.entries(SUITES).map(([id, s]) => (
              <button
                key={id}
                onClick={() => setSuiteId(id)}
                style={{
                  padding: '8px 11px', borderRadius: 7, cursor: 'pointer', textAlign: 'left', outline: 'none',
                  border: `1px solid ${suiteId === id ? C.accent : 'var(--border)'}`,
                  background: suiteId === id ? `${C.accent}18` : 'var(--bg3)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: suiteId === id ? C.accent : C.text, fontFamily: 'var(--mono)' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', marginTop: 2 }}>{s.desc}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                  {s.tests.map(tid => {
                    const t = ALL_TESTS.find(x => x.id === tid)
                    return t ? (
                      <span key={tid} style={{ fontSize: 8, color: suiteId === id ? C.accent : C.text3, background: 'var(--bg4)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)' }}>
                        {t.icon} {t.name}
                      </span>
                    ) : null
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sequential badge */}
        <div style={{ background: `${C.green}0e`, border: `1px solid ${C.green}33`, borderRadius: 7, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.green, fontFamily: 'var(--mono)', letterSpacing: 0.5 }}>SEQUENTIAL MODE</div>
          <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', marginTop: 3, lineHeight: 1.6 }}>
            One model at a time · one test at a time · accurate unbiased results
          </div>
        </div>

        {/* Models */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, letterSpacing: 1 }}>MODELS ({selected.size}/{models.length})</div>
            <button onClick={toggleAll} style={{ fontSize: 9, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)' }}>
              {selected.size === models.length ? 'None' : 'All'}
            </button>
          </div>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {models.length === 0 && <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Loading…</span>}
            {models.map(m => {
              const isDone = Object.keys(modelResults[m] || {}).length > 0
              const s = scores[m]
              return (
                <label key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(m.name)} onChange={() => toggleModel(m.name)} style={{ accentColor: C.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.text, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize: 8, color: C.text3, fontFamily: 'var(--mono)' }}>{fmtBytes(m.size)}</div>
                  </div>
                  {isDone && s != null && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor(s), fontFamily: 'var(--mono)', flexShrink: 0 }}>{s}</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {/* Run / Stop */}
        <button
          onClick={running ? stop : run}
          disabled={!running && !canRun}
          style={{
            padding: '11px 0', borderRadius: 8,
            cursor: running || canRun ? 'pointer' : 'not-allowed',
            border: running ? `1px solid ${C.red}` : 'none',
            background: running ? `${C.red}18` : canRun ? C.accent : 'var(--bg4)',
            color: running ? C.red : canRun ? '#fff' : C.text3,
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 0.5,
          }}
        >
          {running
            ? `STOP`
            : `RUN  (${selected.size} × ${activeTests.length})`}
        </button>

        {hasResults && !running && (
          <button
            onClick={exportResults}
            style={{ padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text2, fontSize: 9, fontFamily: 'var(--mono)' }}
          >
            Export JSON
          </button>
        )}
        </div>{/* end inner content */}
      </div>{/* end config sidebar */}

      {/* ── Results panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {SUITES[suiteId]?.label} Benchmark
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', fontWeight: 400, marginLeft: 8 }}>
                {activeTests.length} tests · sequential · {running ? 'running…' : 'idle'}
              </span>
            </div>
            {lastRun && <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)' }}>Last run: {lastRun.toLocaleTimeString()}</div>}
          </div>
          {hasResults && (
            <div style={{ display: 'flex', gap: 5 }}>
              <Chip active={view === 'matrix'} onClick={() => setView('matrix')}>Matrix</Chip>
              <Chip active={view === 'leaderboard'} onClick={() => setView('leaderboard')}>Leaderboard</Chip>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {running && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.text, fontFamily: 'var(--mono)' }}>
                Model <span style={{ color: C.accent }}>{progress.mi}/{progress.mt}</span>
                {currentModel && <span style={{ color: C.text2 }}> — {currentModel}</span>}
              </span>
              {currentTest && (
                <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                  {currentTest.icon} {currentTest.name} ({progress.ti}/{progress.tt})
                </span>
              )}
            </div>
            <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress.mt > 0 ? ((progress.mi - 1 + (progress.ti / progress.tt)) / progress.mt) * 100 : 0}%`,
                background: `linear-gradient(90deg, ${C.accent}, ${C.green})`,
                borderRadius: 2, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !running && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
            <div style={{ fontSize: 56 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text2 }}>Advanced Model Benchmark</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: 'var(--mono)', textAlign: 'center', lineHeight: 2 }}>
              Sequential · TTFT · Quality Scoring · Composite Rank<br />
              Pick a suite on the left, select models, click <strong style={{ color: C.accent }}>RUN</strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 560 }}>
              {activeTests.map(t => (
                <div key={t.id} style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg3)', padding: '4px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  {t.icon} <strong style={{ color: C.text2 }}>{t.name}</strong> — {t.desc}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Matrix view ── */}
        {hasResults && view === 'matrix' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                  <th style={thSx({ textAlign: 'left', width: '22%' })}>MODEL</th>
                  <th style={thSx({ color: C.amber, width: '7%' })}>SCORE</th>
                  {activeTests.map(t => (
                    <th key={t.id} style={thSx({ whiteSpace: 'nowrap', width: `${Math.floor(52 / activeTests.length)}%` })}>{t.icon} {t.name}</th>
                  ))}
                  <th style={thSx({ color: C.green, width: '6%' })}>t/s</th>
                  <th style={thSx({ color: C.cyan, width: '7%' })}>TTFT</th>
                  <th style={thSx({ color: C.text3, width: '6%' })}>PASS</th>
                </tr>
              </thead>
              <tbody>
                {rankedModels.map((model, idx) => {
                  const mr = modelResults[model] || {}
                  const s = scores[model] || 0
                  const sc = scoreColor(s)
                  const rankColor = idx === 0 ? C.amber : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : C.text3

                  const tpsVals = Object.values(mr).filter(r => r.summary?.avgTokensPerSec > 0)
                  const avgTps = tpsVals.length > 0 ? tpsVals.reduce((a, r) => a + r.summary.avgTokensPerSec, 0) / tpsVals.length : 0

                  const ttftVals = Object.values(mr).filter(r => r.summary?.avgTtft > 0)
                  const avgTtft = ttftVals.length > 0 ? ttftVals.reduce((a, r) => a + r.summary.avgTtft, 0) / ttftVals.length : 0

                  const qVals = Object.values(mr).filter(r => r.summary?.avgQualityScore != null)
                  const passed = qVals.filter(r => r.summary.avgQualityScore >= 100).length

                  return (
                    <tr key={model} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg2)' }}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: rankColor, fontFamily: 'var(--mono)', minWidth: 22 }}>#{idx + 1}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: C.text, fontFamily: 'var(--mono)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{model}</div>
                            <div style={{ fontSize: 8, color: C.text3, fontFamily: 'var(--mono)' }}>{fmtBytes(models.find(m => m.name === model)?.size)}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: sc, fontFamily: 'var(--mono)' }}>{s}</span>
                      </td>
                      {activeTests.map(test => <MatrixCell key={test.id} result={mr[test.id]} />)}
                      <td style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border)', fontSize: 10, color: C.green, fontFamily: 'var(--mono)' }}>
                        {avgTps > 0 ? avgTps.toFixed(1) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border)', fontSize: 10, color: C.cyan, fontFamily: 'var(--mono)' }}>
                        {avgTtft > 0 ? fmtMs(Math.round(avgTtft)) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--mono)', color: qVals.length > 0 && passed === qVals.length ? C.green : C.text }}>
                        {qVals.length > 0 ? `${passed}/${qVals.length}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              {[
                { label: 'SCORE', desc: 'Composite (speed 35% + quality 65%), normalized against fastest model' },
                { icon: '✓', color: C.green, desc: 'Quality check passed' },
                { icon: '✗', color: C.red, desc: 'Quality check failed (speed still counted)' },
                { label: 'TTFT', desc: 'Time to first token (streaming latency)' },
              ].map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {l.icon ? <span style={{ fontSize: 11, color: l.color }}>{l.icon}</span> : <span style={{ fontSize: 9, fontWeight: 700, color: C.text3, fontFamily: 'var(--mono)' }}>{l.label}</span>}
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)' }}>{l.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Leaderboard view ── */}
        {hasResults && view === 'leaderboard' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rankedModels.map((model, idx) => {
              const mr = modelResults[model] || {}
              const s = scores[model] || 0
              const sc = scoreColor(s)
              const rankColors = [C.amber, '#c0c0c0', '#cd7f32']
              const rankColor = idx < 3 ? rankColors[idx] : C.text3

              const tpsVals = Object.values(mr).filter(r => r.summary?.avgTokensPerSec > 0)
              const avgTps = tpsVals.length > 0 ? tpsVals.reduce((a, r) => a + r.summary.avgTokensPerSec, 0) / tpsVals.length : 0

              const latVals = Object.values(mr).filter(r => r.summary?.avgResponseTimeMs > 0)
              const avgLat = latVals.length > 0 ? latVals.reduce((a, r) => a + r.summary.avgResponseTimeMs, 0) / latVals.length : 0

              const ttftVals = Object.values(mr).filter(r => r.summary?.avgTtft > 0)
              const avgTtft = ttftVals.length > 0 ? ttftVals.reduce((a, r) => a + r.summary.avgTtft, 0) / ttftVals.length : 0

              const qVals = Object.values(mr).filter(r => r.summary?.avgQualityScore != null)
              const passed = qVals.filter(r => r.summary.avgQualityScore >= 100).length

              return (
                <div
                  key={model}
                  style={{
                    background: 'var(--bg2)',
                    border: `1px solid ${idx === 0 ? C.amber + '44' : 'var(--border)'}`,
                    borderLeft: `4px solid ${rankColor}`,
                    borderRadius: 10, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: rankColor, fontFamily: 'var(--mono)', minWidth: 36 }}>#{idx + 1}</div>

                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model}</div>
                    <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)' }}>{fmtBytes(models.find(m => m.name === model)?.size)}</div>
                  </div>

                  {/* Big score */}
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: 32, fontWeight: 900, color: sc, fontFamily: 'var(--mono)', lineHeight: 1 }}>{s}</div>
                    <div style={{ fontSize: 8, color: C.text3, fontFamily: 'var(--mono)', letterSpacing: 0.5 }}>SCORE</div>
                  </div>

                  {/* KPIs */}
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {[
                      { label: 'ACCURACY', value: qVals.length > 0 ? `${passed}/${qVals.length}` : '—', color: qVals.length > 0 && passed === qVals.length ? C.green : C.amber },
                      { label: 'AVG LAT',  value: avgLat > 0 ? fmtMs(Math.round(avgLat)) : '—',         color: C.cyan },
                      { label: 'TTFT',     value: avgTtft > 0 ? fmtMs(Math.round(avgTtft)) : '—',       color: C.text2 },
                      { label: 'TOK/S',    value: avgTps > 0 ? avgTps.toFixed(1) : '—',                  color: C.green },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{value}</div>
                        <div style={{ fontSize: 8, color: C.text3, fontFamily: 'var(--mono)', letterSpacing: 0.5 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per-test pills */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: '1 1 100%' }}>
                    {activeTests.map(test => {
                      const r = mr[test.id]
                      const q = r?.summary?.avgQualityScore
                      const hasQ = q != null
                      const err = r?.status === 'error'
                      const pend = !r || r.status === 'pending'
                      const run2 = r?.status === 'running'
                      const pillColor = err ? C.red : run2 ? C.accent : hasQ ? (q >= 100 ? C.green : C.red) : C.text3
                      return (
                        <div key={test.id} style={{
                          fontSize: 9, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 12,
                          background: `${pillColor}15`, color: pillColor,
                          border: `1px solid ${pillColor}33`,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>{test.icon}</span>
                          <span style={{ fontWeight: 600 }}>{test.name}</span>
                          <span style={{ color: C.text3 }}>
                            {pend ? '—' : run2 ? '···' : err ? '✗' : hasQ ? (q >= 100 ? '✓' : '✗') : ''}
                            {!pend && !run2 && !err && r?.summary?.avgResponseTimeMs ? ` ${fmtMs(r.summary.avgResponseTimeMs)}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Table header style helper
function thSx(extra = {}) {
  return {
    padding: '7px 8px',
    fontSize: 9,
    fontWeight: 700,
    color: C.text3,
    fontFamily: 'var(--mono)',
    letterSpacing: 0.5,
    borderBottom: '2px solid var(--border)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    ...extra,
  }
}
