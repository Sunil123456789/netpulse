'use strict';

const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');

const stats     = require('./stats.js');
const triage    = require('./triage.js');
const brief     = require('./brief.js');
const logs      = require('./logs.js');
const zabbix    = require('./zabbix.js');
const nlSearch  = require('./nlSearch.js');
const edr       = require('./edr.js');
const anomalies = require('./anomalies.js');
const alerts    = require('./alerts.js');
const aiConfig  = require('./aiConfig.js');
const tickets   = require('./tickets.js');

const ALL_MODULES = [stats, triage, brief, logs, zabbix, nlSearch, edr, anomalies, alerts, aiConfig, tickets];

const definitions = ALL_MODULES.flatMap(m => m.definitions);

const HANDLERS = Object.assign({}, ...ALL_MODULES.map(m => m.handlers));

async function dispatch({ name, arguments: args }) {
  const handler = HANDLERS[name];
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: "${name}"`);
  }
  const result = await handler(args || {});
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

module.exports = { definitions, dispatch };
