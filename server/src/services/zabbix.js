class ZabbixClient {
  constructor() {
    this.token = null
    this.tokenExpiry = 0
  }

  get url() { return process.env.ZABBIX_URL || '' }
  get user() { return process.env.ZABBIX_USER || 'Admin' }
  get password() { return process.env.ZABBIX_PASSWORD || 'zabbix' }

  async call(method, params) {
    if (!this.url) throw new Error('ZABBIX_URL not configured')
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
      auth: method === 'user.login' ? null : this.token,
    })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    let response
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    const data = await response.json()
    if (data.error) {
      throw new Error(`Zabbix error [${method}]: ${data.error.data || data.error.message}`)
    }
    return data.result
  }

  async login() {
    this.token = await this.call('user.login', { user: this.user, password: this.password })
    this.tokenExpiry = Date.now() + 25 * 60 * 1000
  }

  async ensureAuth() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.login()
    }
  }

  async getHosts() {
    await this.ensureAuth()
    return this.call('host.get', {
      output: ['hostid', 'host', 'name', 'status', 'available', 'description'],
      selectInterfaces: ['ip', 'main', 'type'],
      selectGroups: ['groupid', 'name'],
      selectTags: ['tag', 'value'],
      sortfield: 'name',
    })
  }

  async getProblems() {
    await this.ensureAuth()
    return this.call('problem.get', {
      output: 'extend',
      selectAcknowledges: 'extend',
      selectTags: 'extend',
      selectHosts: ['hostid', 'name'],
      recent: true,
      sortfield: ['severity', 'eventid'],
      sortorder: 'DESC',
    })
  }

  async getHostGroups() {
    await this.ensureAuth()
    return this.call('hostgroup.get', {
      output: ['groupid', 'name'],
      real_hosts: true,
      sortfield: 'name',
    })
  }

  async getHostMetrics(hostids) {
    await this.ensureAuth()
    return this.call('item.get', {
      hostids,
      output: ['itemid', 'hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'units'],
      filter: {
        key_: [
          'system.cpu.util',
          'vm.memory.utilization',
          'vfs.fs.size[/,pused]',
          'system.uptime',
          'net.if.in',
          'net.if.out',
        ],
      },
      sortfield: 'key_',
    })
  }

  async getTriggers() {
    await this.ensureAuth()
    return this.call('trigger.get', {
      output: 'extend',
      filter: { value: 1 },
      selectHosts: ['hostid', 'name'],
      sortfield: 'priority',
      sortorder: 'DESC',
      limit: 50,
    })
  }

  async getHistory(itemid, hours = 24) {
    await this.ensureAuth()
    return this.call('history.get', {
      output: 'extend',
      itemids: [itemid],
      time_from: Math.floor((Date.now() - hours * 3_600_000) / 1000),
      sortfield: 'clock',
      sortorder: 'ASC',
      limit: 100,
    })
  }

  async getEvents(hours = 24) {
    await this.ensureAuth()
    return this.call('event.get', {
      output: 'extend',
      selectHosts: ['name'],
      selectAcknowledges: 'extend',
      time_from: Math.floor((Date.now() - hours * 3_600_000) / 1000),
      sortfield: 'clock',
      sortorder: 'DESC',
      limit: 100,
      value: 1,
    })
  }
}

export const zabbix = new ZabbixClient()
