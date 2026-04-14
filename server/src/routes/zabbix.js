import { Router } from 'express'
import { zabbix } from '../services/zabbix.js'

const router = Router()
const SEV = ['Not classified', 'Info', 'Warning', 'Average', 'High', 'Disaster']
const nowSecs = () => Math.floor(Date.now() / 1000)
const configured = () => !!(process.env.ZABBIX_URL && process.env.ZABBIX_TOKEN)
const updatedAt = () => new Date().toISOString()

function sendUnavailable(res, error, data = [], extra = {}) {
  return res.status(503).json({
    connected: false,
    degraded: true,
    dependency: 'zabbix',
    error,
    updatedAt: updatedAt(),
    data,
    ...extra,
  })
}

function sendOk(res, data = [], extra = {}) {
  return res.json({
    connected: true,
    degraded: false,
    dependency: 'zabbix',
    updatedAt: updatedAt(),
    data,
    ...extra,
  })
}

// GET /api/zabbix/overview — connection check + summary stats
router.get('/overview', async (_req, res) => {
  if (!configured()) {
    return sendUnavailable(
      res,
      'Zabbix is not configured',
      [],
      {
        hosts: { total: 0, up: 0, down: 0, unknown: 0 },
        problems: { total: 0, disaster: 0, high: 0, average: 0, warning: 0, info: 0 },
        groups: 0,
      }
    )
  }
  try {
    const [hosts, problems, groups] = await Promise.all([
      zabbix.getHosts(),
      zabbix.getProblems(),
      zabbix.getGroups(),
    ])

    const h = { total: hosts.length, up: 0, down: 0, unknown: 0 }
    for (const host of hosts) {
      const iface = (host.interfaces || []).find(i => i.main === '1')
      const a = iface ? +iface.available : +host.available
      if (a === 1) h.up++; else if (a === 2) h.down++; else h.unknown++
    }

    const p = { total: problems.length, disaster: 0, high: 0, average: 0, warning: 0, info: 0 }
    for (const prob of problems) {
      const s = +prob.severity
      if (s === 5) p.disaster++; else if (s === 4) p.high++; else if (s === 3) p.average++
      else if (s === 2) p.warning++; else p.info++
    }

    sendOk(res, [], { hosts: h, problems: p, groups: groups.length })
  } catch (err) {
    sendUnavailable(
      res,
      err.message,
      [],
      {
        hosts: { total: 0, up: 0, down: 0, unknown: 0 },
        problems: { total: 0, disaster: 0, high: 0, average: 0, warning: 0, info: 0 },
        groups: 0,
      }
    )
  }
})

// GET /api/zabbix/hosts — all hosts enriched with metrics + problem counts
router.get('/hosts', async (_req, res) => {
  if (!configured()) return sendUnavailable(res, 'Zabbix is not configured')
  try {
    const [hosts, problems, metrics] = await Promise.all([
      zabbix.getHosts(),
      zabbix.getProblems(),
      zabbix.getMetrics([]).catch(() => []),
    ])

    const probByHost = {}
    for (const p of problems)
      for (const h of (p.hosts || []))
        probByHost[h.hostid] = (probByHost[h.hostid] || 0) + 1

    const mByHost = {}
    for (const m of metrics) {
      if (!mByHost[m.hostid]) mByHost[m.hostid] = {}
      const v = parseFloat(m.lastvalue)
      const k = m.key_
      if (k === 'system.cpu.util')       mByHost[m.hostid].cpu   = isNaN(v) ? null : Math.round(v * 10) / 10
      if (k === 'vm.memory.utilization') mByHost[m.hostid].ram   = isNaN(v) ? null : Math.round(v * 10) / 10
      if (k.startsWith('vfs.fs.size'))   mByHost[m.hostid].disk  = isNaN(v) ? null : Math.round(v * 10) / 10
      if (k === 'system.uptime')         mByHost[m.hostid].uptime = isNaN(v) ? null : v
    }

    const data = hosts.map(h => ({
      id:        h.hostid,
      name:      h.name || h.host,
      ip:        (h.interfaces || []).find(i => i.main === '1')?.ip || '',
      available: +((h.interfaces || []).find(i => i.main === '1')?.available ?? h.available),
      status:    +h.status,
      groups:    (h.groups || []).map(g => g.name),
      metrics:   mByHost[h.hostid] || { cpu: null, ram: null, disk: null, uptime: null },
      problems:  probByHost[h.hostid] || 0,
    }))
    sendOk(res, data, { count: data.length })
  } catch (err) {
    sendUnavailable(res, err.message)
  }
})

// GET /api/zabbix/problems — active problems
router.get('/problems', async (_req, res) => {
  if (!configured()) return sendUnavailable(res, 'Zabbix is not configured')
  try {
    const problems = await zabbix.getProblems()
    const ts = nowSecs()
    const data = problems.map(p => ({
      id:            p.eventid,
      name:          p.name,
      severity:      +p.severity,
      severityLabel: SEV[+p.severity] || 'Unknown',
      host:          p.hosts?.[0]?.name  || '',
      hostId:        p.hosts?.[0]?.hostid || '',
      startedAt:     new Date(+p.clock * 1000).toISOString(),
      duration:      ts - +p.clock,
      acknowledged:  p.acknowledged === '1',
      tags:          p.tags || [],
    }))
    sendOk(res, data, { count: data.length })
  } catch (err) {
    sendUnavailable(res, err.message)
  }
})

// GET /api/zabbix/groups — host groups with hosts + problem counts
router.get('/groups', async (_req, res) => {
  if (!configured()) return sendUnavailable(res, 'Zabbix is not configured')
  try {
    const [groups, hosts, problems] = await Promise.all([
      zabbix.getGroups(),
      zabbix.getHosts(),
      zabbix.getProblems(),
    ])

    const hostsByGroup = {}
    for (const h of hosts)
      for (const g of (h.groups || [])) {
        if (!hostsByGroup[g.groupid]) hostsByGroup[g.groupid] = []
        hostsByGroup[g.groupid].push({ id: h.hostid, name: h.name || h.host, available: +h.available })
      }

    const probByHost = {}
    for (const p of problems)
      for (const h of (p.hosts || []))
        probByHost[h.hostid] = (probByHost[h.hostid] || 0) + 1

    const data = groups.map(g => {
      const gh = hostsByGroup[g.groupid] || []
      return {
        id:        g.groupid,
        name:      g.name,
        hostCount: gh.length,
        hosts:     gh.slice(0, 8),
        problems:  gh.reduce((acc, h) => acc + (probByHost[h.id] || 0), 0),
      }
    })
    sendOk(res, data, { count: data.length })
  } catch (err) {
    sendUnavailable(res, err.message)
  }
})

// GET /api/zabbix/events — recent events last 24h
router.get('/events', async (_req, res) => {
  if (!configured()) return sendUnavailable(res, 'Zabbix is not configured')
  try {
    const events = await zabbix.getEvents(24)
    const data = events.map(e => ({
      id:            e.eventid,
      name:          e.name,
      severity:      +e.severity,
      severityLabel: SEV[+e.severity] || 'Unknown',
      host:          e.hosts?.[0]?.name || '',
      timestamp:     new Date(+e.clock * 1000).toISOString(),
      clock:         +e.clock,
      acknowledged:  e.acknowledged === '1',
    }))
    sendOk(res, data, { count: data.length })
  } catch (err) {
    sendUnavailable(res, err.message)
  }
})

export default router


