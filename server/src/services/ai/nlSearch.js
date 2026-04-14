import { taskRouter } from './taskRouter.js'
import { scoreResponse } from './scorer.js'
import { getESClient } from '../../config/elasticsearch.js'
import { zabbix } from '../zabbix.js'
import Ticket from '../../models/Ticket.js'
import Device from '../../models/Device.js'

// Predefined valid query templates
const TEMPLATES = {
  top_denied_ips: {
    description: 'Top source IPs with denied/blocked connections',
    keywords: ['denied','blocked','top ip','source ip','block'],
    source: 'elasticsearch',
    index: 'firewall-*',
    buildQuery: (from, to) => ({
      size: 0,
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { term: { 'fgt.action.keyword': 'deny' } }
      ]}},
      aggs: { top_ips: { terms: { field: 'fgt.srcip.keyword', size: 15 } } }
    }),
    formatResults: (r) => r.aggregations?.top_ips?.buckets?.map(b => ({ ip: b.key, count: b.doc_count })) || []
  },

  ips_alerts: {
    description: 'IPS/intrusion detection alerts',
    keywords: ['ips','intrusion','attack','threat','exploit'],
    source: 'elasticsearch',
    index: 'firewall-*',
    buildQuery: (from, to) => ({
      size: 20,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { term: { 'fgt.subtype.keyword': 'ips' } }
      ]}},
      _source: ['@timestamp','fgt.srcip','fgt.dstip','fgt.attack','fgt.severity','site_name']
    }),
    formatResults: (r) => r.hits?.hits?.map(h => h._source) || []
  },

  traffic_summary: {
    description: 'Overall firewall traffic summary',
    keywords: ['traffic','firewall','events','summary','total'],
    source: 'elasticsearch',
    index: 'firewall-*',
    buildQuery: (from, to) => ({
      size: 0,
      query: { range: { '@timestamp': { gte: from, lte: to } } },
      aggs: {
        by_action: { terms: { field: 'fgt.action.keyword', size: 5 } },
        by_site: { terms: { field: 'site_name.keyword', size: 10 } },
        by_app: { terms: { field: 'fgt.app.keyword', size: 10 } }
      }
    }),
    formatResults: (r) => ({
      by_action: r.aggregations?.by_action?.buckets || [],
      by_site: r.aggregations?.by_site?.buckets || [],
      by_app: r.aggregations?.by_app?.buckets || []
    })
  },

  top_countries: {
    description: 'Top source countries in firewall logs',
    keywords: ['country','countries','geo','location','where'],
    source: 'elasticsearch',
    index: 'firewall-*',
    buildQuery: (from, to) => ({
      size: 0,
      query: { range: { '@timestamp': { gte: from, lte: to } } },
      aggs: {
        src_countries: { terms: { field: 'fgt.srccountry.keyword', size: 15 } },
        denied_countries: {
          filter: { term: { 'fgt.action.keyword': 'deny' } },
          aggs: { countries: { terms: { field: 'fgt.srccountry.keyword', size: 15 } } }
        }
      }
    }),
    formatResults: (r) => ({
      all_traffic: r.aggregations?.src_countries?.buckets?.map(b => ({ country: b.key, count: b.doc_count })) || [],
      denied_only: r.aggregations?.denied_countries?.countries?.buckets?.map(b => ({ country: b.key, count: b.doc_count })) || []
    })
  },

  mac_flapping: {
    description: 'MAC address flapping events on Cisco switches',
    keywords: ['mac','flap','flapping','switch','cisco'],
    source: 'elasticsearch',
    index: 'cisco-*',
    buildQuery: (from, to) => ({
      size: 30,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { term: { 'cisco_mnemonic.keyword': 'MACFLAP_NOTIF' } }
      ]}},
      _source: ['@timestamp','cisco_mac_address','cisco_vlan_id','device_name','site_name','cisco_message']
    }),
    formatResults: (r) => r.hits?.hits?.map(h => h._source) || []
  },

  interface_changes: {
    description: 'Network interface up/down changes',
    keywords: ['interface','port','up','down','link','updown'],
    source: 'elasticsearch',
    index: 'cisco-*',
    buildQuery: (from, to) => ({
      size: 30,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { term: { 'cisco_mnemonic.keyword': 'UPDOWN' } }
      ]}},
      _source: ['@timestamp','cisco_interface_full','cisco_message','device_name','site_name']
    }),
    formatResults: (r) => r.hits?.hits?.map(h => h._source) || []
  },

  switch_logins: {
    description: 'Login/logout events on network switches',
    keywords: ['login','logout','auth','user','ssh','access'],
    source: 'elasticsearch',
    index: 'cisco-*',
    buildQuery: (from, to) => ({
      size: 30,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { terms: { 'cisco_mnemonic.keyword': ['LOGIN_SUCCESS','LOGOUT','SSH2_USERAUTH'] } }
      ]}},
      _source: ['@timestamp','cisco_mnemonic','cisco_message','device_name','site_name']
    }),
    formatResults: (r) => r.hits?.hits?.map(h => h._source) || []
  },

  usb_events: {
    description: 'USB device connection events from SentinelOne EDR',
    keywords: ['usb','device','endpoint','sentinel','edr','connected'],
    source: 'elasticsearch',
    index: 'sentinel-*',
    buildQuery: (from, to) => ({
      size: 30,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': { gte: from, lte: to } } },
        { term: { 'data.interface.keyword': 'USB' } }
      ]}},
      _source: ['@timestamp','data.computerName','data.deviceName','data.eventType','data.lastLoggedInUserName','site_name']
    }),
    formatResults: (r) => r.hits?.hits?.map(h => h._source) || []
  },

  zabbix_down_hosts: {
    description: 'Zabbix hosts that are down or unreachable',
    keywords: ['zabbix','host','down','unreachable','offline','server'],
    source: 'zabbix',
    execute: async () => {
      const hosts = await zabbix.getHosts()
      return hosts
        .filter(h => {
          const avail = +((h.interfaces || []).find(i => i.main === '1')?.available ?? h.available)
          return avail === 2
        })
        .map(h => ({
          name: h.name || h.host,
          ip: h.interfaces?.[0]?.ip || '',
          groups: h.groups?.map(g => g.name) || []
        }))
    }
  },

  zabbix_problems: {
    description: 'Active Zabbix problems and alerts',
    keywords: ['problem','alert','zabbix','trigger','critical','warning'],
    source: 'zabbix',
    execute: async () => {
      const problems = await zabbix.getProblems()
      const SEV = ['Not classified','Info','Warning','Average','High','Disaster']
      return problems.slice(0, 30).map(p => ({
        name: p.name,
        severity: SEV[+p.severity] || 'Unknown',
        host: p.hosts?.[0]?.name || '',
        since: new Date(+p.clock * 1000).toISOString()
      }))
    }
  },

  open_tickets: {
    description: 'Open support tickets in NetPulse',
    keywords: ['ticket','open','incident','issue','case'],
    source: 'mongodb',
    execute: async () => {
      return Ticket.find({ status: { $in: ['open','in_progress'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    }
  },

  devices: {
    description: 'Registered devices in NetPulse',
    keywords: ['device','registered','fortigate','router','firewall device'],
    source: 'mongodb',
    execute: async () => {
      return Device.find({}).sort({ name: 1 }).limit(50).lean()
    }
  }
}

// Simple keyword matching to find best template
function findBestTemplate(question) {
  const q = question.toLowerCase()
  let bestMatch = null
  let bestScore = 0

  for (const [key, template] of Object.entries(TEMPLATES)) {
    const score = template.keywords.filter(k => q.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      bestMatch = { key, template }
    }
  }

  // Default to traffic summary if no match
  if (!bestMatch || bestScore === 0) {
    return { key: 'traffic_summary', template: TEMPLATES.traffic_summary }
  }

  return bestMatch
}

async function processNLSearch({
  question,
  source = 'auto',
  dateRange = null,
  overrideProvider = null,
  overrideModel = null
}) {
  void source
  void overrideProvider
  void overrideModel
  const startTime = Date.now()
  const from = dateRange?.from || 'now-24h'
  const to = dateRange?.to || 'now'

  // Find best matching template
  const { key, template } = findBestTemplate(question)

  let results = []
  let totalHits = 0

  if (template.source === 'elasticsearch') {
    const es = getESClient()
    const query = template.buildQuery(from, to)
    const esResult = await es.search({ index: template.index, body: query })
    results = template.formatResults(esResult)
    totalHits = esResult.hits?.total?.value ||
      (Array.isArray(results) ? results.length : Object.keys(results).length)

  } else if (template.source === 'zabbix') {
    results = await template.execute()
    totalHits = results.length

  } else if (template.source === 'mongodb') {
    results = await template.execute()
    totalHits = results.length
  }

  const executionTimeMs = Date.now() - startTime

  // Score as fast local operation
  const scoring = await scoreResponse({
    task: 'search',
    provider: 'template',
    model: 'keyword-match',
    query: question,
    response: JSON.stringify(results).slice(0, 500),
    responseTimeMs: executionTimeMs,
    tokensUsed: 0,
    save: true
  })

  await taskRouter.updateLastRun('search', 'success', executionTimeMs)

  return {
    question,
    matchedTemplate: key,
    templateDescription: template.description,
    provider: 'template',
    model: 'keyword-match',
    source: template.source,
    results: Array.isArray(results) ? results : [results],
    totalHits,
    executionTimeMs,
    totalScore: scoring.totalScore,
    scoreId: scoring.scoreId
  }
}

export { processNLSearch, TEMPLATES }
