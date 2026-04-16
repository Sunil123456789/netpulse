import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { C, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { buildDateRange, formatTimestamp, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

const SEARCH_SOURCES = [
  { value: 'auto', label: 'Auto Source' },
  { value: 'elasticsearch', label: 'Elasticsearch' },
  { value: 'zabbix', label: 'Zabbix' },
  { value: 'mongodb', label: 'MongoDB' },
]

const SEARCH_SUGGESTIONS = [
  'Top denied IPs in the last 24 hours',
  'Any IPS alerts today?',
  'Show active Zabbix problems',
  'Open tickets right now',
  'Any MAC flapping events?',
  'Top source countries in firewall logs',
]

function SearchResultsView({ results }) {
  if (!results?.length) {
    return (
      <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
        No results returned for this query
      </div>
    )
  }

  const rows = Array.isArray(results) ? results : [results]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row, idx) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          return (
            <div key={idx} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {Object.entries(row).map(([key, value]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>
                      {String(key).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
                    </div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {Array.isArray(value)
                        ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
                        : value == null
                          ? '—'
                          : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        return (
          <div key={idx} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: C.text, lineHeight: 1.6 }}>
            {typeof row === 'string' ? row : JSON.stringify(row)}
          </div>
        )
      })}
    </div>
  )
}

export default function SearchTab({ providerStatus, ollamaStatus, range, addToast }) {
  const [query, setQuery] = useState('')
  const [searchSource, setSearchSource] = useState('auto')
  const [searchProvider, setSearchProvider] = useState(null)
  const [searchModel, setSearchModel] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResult, setSearchResult] = useState(null)
  const [searchHistory, setSearchHistory] = useState([])
  const [starRated, setStarRated] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    aiAPI.getSearchHistory().then(r => setSearchHistory(r.data || [])).catch(() => {})
  }, [])

  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(searchProvider, providerStatus, ollamaStatus)

  async function runSearch(text = query) {
    const question = text.trim()
    if (!question || searchLoading) return

    setSearchLoading(true)
    setStarRated(false)
    try {
      const { data } = await aiAPI.search(
        question,
        searchSource,
        buildDateRange(range),
        searchProvider || undefined,
        searchModel || undefined,
      )
      setQuery(question)
      setSearchResult(data)
      aiAPI.getSearchHistory().then(r => setSearchHistory(r.data || [])).catch(() => {})
      addToast('Search complete', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSearchLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function rateResponse(star) {
    if (!searchResult?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(searchResult.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Source:</span>
        <select value={searchSource} onChange={e => setSearchSource(e.target.value)} style={selSx}>
          {SEARCH_SOURCES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider:</span>
        <select
          value={searchProvider || 'default'}
          onChange={e => { setSearchProvider(e.target.value === 'default' ? null : e.target.value); setSearchModel(null) }}
          style={selSx}
        >
          <option value="default">Use Task Config</option>
          {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {searchProvider && (
          <select
            value={searchModel || 'auto'}
            onChange={e => setSearchModel(e.target.value === 'auto' ? null : e.target.value)}
            style={selSx}
          >
            <option value="auto">auto</option>
            {overrideModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <Card title="NATURAL LANGUAGE SEARCH" noPad>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() }
              }}
              rows={3}
              placeholder="Ask a search question like 'top denied IPs in the last 24 hours'"
              disabled={searchLoading}
              style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                color: C.text, borderRadius: 8, padding: '10px 12px',
                fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => runSearch()}
              disabled={!query.trim() || searchLoading}
              style={{
                minWidth: 140, border: 'none', borderRadius: 8,
                background: (!query.trim() || searchLoading) ? 'var(--bg4)' : C.accent2,
                color: (!query.trim() || searchLoading) ? C.text3 : '#fff',
                cursor: (!query.trim() || searchLoading) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, padding: '10px 14px',
              }}
            >
              {searchLoading ? 'Searching...' : '▶ Run Search'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SEARCH_SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => runSearch(s)}
                disabled={searchLoading}
                style={{
                  fontSize: 10, padding: '5px 10px', borderRadius: 20,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: C.text2, cursor: searchLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {searchResult ? (
        <Card title="SEARCH RESULTS" noPad>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Template:</span>
            <span style={{ fontSize: 10, color: C.text, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '3px 8px', borderRadius: 12 }}>
              {searchResult.matchedTemplate}
            </span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{searchResult.templateDescription}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Source: {searchResult.source}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{searchResult.totalHits} hit{searchResult.totalHits === 1 ? '' : 's'}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{(searchResult.executionTimeMs / 1000).toFixed(2)}s</span>
            {searchResult.provider && <ProviderBadge provider={searchResult.provider} />}
            {searchResult.totalScore != null && (
              <span style={{
                fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                background: searchResult.totalScore >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)',
                color: searchResult.totalScore >= 7 ? C.green : C.amber,
                border: `1px solid ${searchResult.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
              }}>
                Score: {searchResult.totalScore}/10
              </span>
            )}
          </div>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Question</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{searchResult.question}</div>
            </div>

            <SearchResultsView results={searchResult.results} />

            {searchResult.scoreId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {starRated ? (
                  <span style={{ fontSize: 11, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: C.text3, fontFamily: 'var(--mono)' }}>Rate this search:</span>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(null)}
                        onClick={() => rateResponse(star)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, padding: '0 1px', lineHeight: 1,
                          opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3,
                          filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)',
                        }}
                      >⭐</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card title="SEARCH RESULTS" noPad>
          <div style={{ padding: '28px 18px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            Ask a natural language question above to query Elasticsearch, Zabbix, or MongoDB-backed operational data
          </div>
        </Card>
      )}

      <Card title="RECENT SEARCHES" badge={searchHistory.length} badgeClass="blue" noPad>
        {searchHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No searches run yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Question', 'Provider', 'Model', 'Score', 'Action'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: C.text3, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searchHistory.slice(0, 10).map((row, i) => (
                  <tr key={row._id || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
                    <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{formatTimestamp(row.createdAt)}</td>
                    <td style={{ padding: '7px 12px', color: C.text, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.query || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.provider || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.model || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.totalScore ?? '—'}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <button
                        onClick={() => runSearch(row.query || '')}
                        disabled={searchLoading || !row.query}
                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                      >
                        Rerun
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
