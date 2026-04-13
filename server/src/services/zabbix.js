const TIMEOUT_MS = 10_000

class ZabbixClient {
  get url()   { return process.env.ZABBIX_URL   || '' }
  get token() { return process.env.ZABBIX_TOKEN || '' }

  async call(method, params = {}) {
    if (!this.url)   throw new Error('ZABBIX_URL not configured')
    if (!this.token) throw new Error('ZABBIX_TOKEN not configured')

    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res
    try {
      res = await fetch(this.url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
        body:    JSON.stringify({ jsonrpc: '2.0', method, params, id: 1, auth: null }),
        signal:  ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json'))
      throw new Error(`Zabbix returned HTTP ${res.status} (non-JSON) — verify ZABBIX_URL path`)

    const data = await res.json()
    if (data.error) throw new Error(data.error.data || data.error.message || 'Zabbix API error')
    return data.result
  }

  getVersion()  { return this.call('apiinfo.version', []) }

  getHosts() {
    return this.call('host.get', {
      output: ['hostid', 'host', 'name', 'status', 'available'],
      selectInventory: ['os'],
      monitored_hosts: true,
      selectInterfaces: ['ip', 'main', 'available', 'type'],
      selectGroups: ['groupid', 'name'],
      sortfield: 'name',
    })
  }

  getProblems() {
    return this.call('problem.get', {
      output: 'extend',
      selectHosts: ['hostid', 'name'],
      selectTags: 'extend',
      selectAcknowledges: 'extend',
      recent: true,
      sortfield: ['eventid'],
      sortorder: 'DESC',
    })
  }

  getGroups() {
    return this.call('hostgroup.get', {
      output: ['groupid', 'name'],
      real_hosts: true,
      sortfield: 'name',
    })
  }

  getMetrics(hostids) {
    const params = {
      output: ['itemid', 'hostid', 'key_', 'lastvalue'],
      filter: { key_: ['system.cpu.util', 'vm.memory.utilization', 'vfs.fs.size[/,pused]', 'system.uptime'] },
    }
    if (hostids?.length) params.hostids = hostids
    return this.call('item.get', params)
  }

  getEvents(hours = 24) {
    return this.call('event.get', {
      output: 'extend',
      selectHosts: ['name'],
      selectAcknowledges: 'extend',
      time_from: Math.floor((Date.now() - hours * 3_600_000) / 1000),
      sortfield: 'clock', sortorder: 'DESC',
      limit: 200, value: 1,
    })
  }
}

export const zabbix = new ZabbixClient()



