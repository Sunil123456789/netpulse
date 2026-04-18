'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_zabbix_problems',
    description: 'List all active infrastructure problems from Zabbix. Each problem includes host, severity (0=Not classified to 5=Disaster), start time, duration, and acknowledgement status.',
    inputSchema: {
      type: 'object',
      properties: {
        min_severity: {
          type: 'integer',
          minimum: 0,
          maximum: 5,
          default: 0,
          description: 'Return only problems at or above this Zabbix severity. 0=All, 1=Info, 2=Warning, 3=Average, 4=High, 5=Disaster.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_zabbix_hosts',
    description: 'Get all monitored hosts from Zabbix with their availability status, interfaces, and latest CPU/RAM/disk metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Filter by Zabbix host group name.' },
        status: {
          type: 'string',
          enum: ['all', 'up', 'down'],
          default: 'all',
          description: 'Filter by host availability status.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_zabbix_overview',
    description: 'Get a high-level Zabbix overview: total hosts, problems by severity, trigger counts, and top problem hosts.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

const handlers = {
  async get_zabbix_problems({ min_severity = 0 } = {}) {
    const data = await client.get('/api/zabbix/problems');
    if (min_severity > 0 && Array.isArray(data?.problems)) {
      return { ...data, problems: data.problems.filter(p => (p.severity ?? 0) >= min_severity) };
    }
    return data;
  },
  async get_zabbix_hosts({ group, status = 'all' } = {}) {
    return client.get('/api/zabbix/hosts', { query: { group, status } });
  },
  async get_zabbix_overview() {
    return client.get('/api/zabbix/overview');
  },
};

module.exports = { definitions, handlers };
