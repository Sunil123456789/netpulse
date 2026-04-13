import { Router } from 'express'
import { zabbix } from '../services/zabbix.js'

const router = Router()

const SEV_LABELS = ['Not classified', 'Info', 'Warning', 'Average', 'High', 'Disaster']

function parseProblemSeverity(p) {
  const s = parseInt(p.severity, 10)
  return { num: s, label: SEV_LABELS[s] || 'Unknown' }
}

function durationSecs(clock) {
  return Math.floor(Date.now() / 1000) - parseInt(clock, 10)
}

// GET /api/zabbix/stats
router.get('/stats', async (_req, res) => {
  if (!process.env.ZABBIX_URL) return res.json({ connected: false, error: 'Not configured' })
  try {
    const [hosts, problems, groups] = await Promise.all([
      zabbix.getHosts(),
      zabbix.getProblems(),
      zabbix.getHostGroups(),
    ])

    const hostStats = { total: hosts.length, up: 0, down: 0, unknown: 0, maintenance: 0 }
    for (const h of hosts) {
      const a = parseInt(h.available, 10)
      if (h.status === '1') { hostStats.maintenance++; continue }
      if (a === 1) hostStats.up++
      else if (a === 2) hostStats.down++
      else hostStats.unknown++
    }

    const probStats = { total: problems.length, critical: 0, high: 0, average: 0, warning: 0, info: 0 }
    for (const p of problems) {
      const s = parseInt(p.severity, 10)
      if (s >= 5) probStats.critical++
      else if (s === 4) probStats.high++
      else if (s === 3) probStats.average++
      else if (s === 2) probStats.warning++
      else probStats.info++
    }

    res.json({ connected: true, hosts: hostStats, problems: probStats, groups: groups.length })
  } catch (err) {
    res.json({ connected: false, error: err.message })
  }
})

// GET /api/zabbix/hosts
router.get('/hosts', async (_req, res) => {
  if (!process.env.ZABBIX_URL) return res.json([])
  try {
    const [hosts, problems, items] = await Promise.all([
      zabbix.getHosts(),
      zabbix.getProblems(),
      zabbix.getHostMetrics([]).catch(() => []),
    ])

    // Build problem count per host
    const probByHost = {}
    for (const p of problems) {
      for (const h of (p.hosts || [])) {
        probByHost[h.hostid] = (probByHost[h.hostid] || 0) + 1
      }
    }

    // Build metrics per host
    const metricsByHost = {}
    for (const item of items) {
      if (!metricsByHost[item.hostid]) metricsByHost[item.hostid] = {}
      const val = parseFloat(item.lastvalue)
      const k = item.key_
      if (k === 'system.cpu.util')       metricsByHost[item.hostid].cpu   = isNaN(val) ? null : Math.round(val * 10) / 10
      if (k === 'vm.memory.utilization') metricsByHost[item.hostid].ram   = isNaN(val) ? null : Math.round(val * 10) / 10
      if (k.startsWith('vfs.fs.size'))   metricsByHost[item.hostid].disk  = isNaN(val) ? null : Math.round(val * 10) / 10
      if (k === 'system.uptime')         metricsByHost[item.hostid].uptime = isNaN(val) ? null : val
    }

    const result = hosts.map(h => {
      const mainIface = (h.interfaces || []).find(i => i.main === '1') || h.interfaces?.[0] || {}
      return {
        id:       h.hostid,
        name:     h.name || h.host,
        ip:       mainIface.ip || '',
        status:   parseInt(h.status, 10),   // 0=monitored, 1=unmonitored
        available: parseInt(h.available, 10), // 0=unknown, 1=up, 2=down
        groups:   (h.groups || []).map(g => g.name),
        tags:     h.tags || [],
        metrics:  metricsByHost[h.hostid] || { cpu: null, ram: null, disk: null, uptime: null },
        problems: probByHost[h.hostid] || 0,
      }
    })

    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/zabbix/problems
router.get('/problems', async (_req, res) => {
  if (!process.env.ZABBIX_URL) return res.json([])
  try {
    const problems = await zabbix.getProblems()
    res.json(problems.map(p => {
      const { num, label } = parseProblemSeverity(p)
      const secs = durationSecs(p.clock)
      return {
        id:           p.eventid,
        name:         p.name,
        severity:     num,
        severityLabel: label,
        host:         p.hosts?.[0]?.name || '',
        hostId:       p.hosts?.[0]?.hostid || '',
        startedAt:    new Date(parseInt(p.clock, 10) * 1000).toISOString(),
        duration:     secs,
        acknowledged: p.acknowledged === '1',
        tags:         p.tags || [],
      }
    }))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/zabbix/groups
router.get('/groups', async (_req, res) => {
  if (!process.env.ZABBIX_URL) return res.json([])
  try {
    const [groups, hosts] = await Promise.all([
      zabbix.getHostGroups(),
      zabbix.getHosts(),
    ])

    const hostsByGroup = {}
    for (const h of hosts) {
      for (const g of (h.groups || [])) {
        if (!hostsByGroup[g.groupid]) hostsByGroup[g.groupid] = []
        hostsByGroup[g.groupid].push({ id: h.hostid, name: h.name || h.host, available: parseInt(h.available, 10) })
      }
    }

    res.json(groups.map(g => ({
      id:        g.groupid,
      name:      g.name,
      hostCount: hostsByGroup[g.groupid]?.length || 0,
      hosts:     (hostsByGroup[g.groupid] || []).slice(0, 8),
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/zabbix/events
router.get('/events', async (_req, res) => {
  if (!process.env.ZABBIX_URL) return res.json([])
  try {
    const events = await zabbix.getEvents(24)
    res.json(events.map(e => ({
      id:           e.eventid,
      name:         e.name,
      severity:     parseInt(e.severity, 10),
      severityLabel: SEV_LABELS[parseInt(e.severity, 10)] || 'Unknown',
      host:         e.hosts?.[0]?.name || '',
      clock:        parseInt(e.clock, 10),
      timestamp:    new Date(parseInt(e.clock, 10) * 1000).toISOString(),
      acknowledged: e.acknowledged === '1',
      acknowledges: e.acknowledges || [],
      value:        parseInt(e.value, 10), // 0=ok 1=problem
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/zabbix/host/:id/metrics
router.get('/host/:id/metrics', async (req, res) => {
  if (!process.env.ZABBIX_URL) return res.json({})
  try {
    const items = await zabbix.getHostMetrics([req.params.id])
    const metrics = {}
    for (const item of items) {
      metrics[item.key_] = {
        name:      item.name,
        value:     item.lastvalue,
        units:     item.units,
        lastclock: item.lastclock,
      }
    }
    res.json(metrics)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
