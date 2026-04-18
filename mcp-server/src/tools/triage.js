'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'triage_alert',
    description: 'Run AI-powered triage on a security alert. Returns severity, category, summary, recommendation, false-positive likelihood (%), MITRE tactic, and whether to auto-create a ticket. Supply any fields available from the raw alert.',
    inputSchema: {
      type: 'object',
      properties: {
        alert: {
          type: 'object',
          description: 'Alert data to triage. Include as many fields as available.',
          properties: {
            type:       { type: 'string', description: 'Alert type: ips, deny, anomaly, utm, vpn' },
            srcip:      { type: 'string', description: 'Source IP address' },
            dstip:      { type: 'string', description: 'Destination IP address' },
            attack:     { type: 'string', description: 'Attack name or IPS signature' },
            action:     { type: 'string', description: 'Firewall action: deny, allow, drop' },
            app:        { type: 'string', description: 'Application name from firewall' },
            srccountry: { type: 'string', description: 'Source country' },
            dstcountry: { type: 'string', description: 'Destination country' },
            msg:        { type: 'string', description: 'Raw log message' },
            site:       { type: 'string', description: 'Site or location name' },
            severity:   { type: 'string', description: 'Pre-classified severity if known' },
            timestamp:  { type: 'string', description: 'ISO 8601 event timestamp' },
            count:      { type: 'number', description: 'Number of times this alert occurred' },
          },
        },
        provider: {
          type: 'string',
          enum: ['claude', 'openai', 'ollama'],
          description: 'Override the AI provider for this triage.',
        },
        model: {
          type: 'string',
          description: 'Override AI model ID. Leave blank to use task default.',
        },
      },
      required: ['alert'],
    },
  },
];

const handlers = {
  async triage_alert({ alert, provider, model } = {}) {
    return client.post('/api/ai/triage', { body: { alert, provider, model } });
  },
};

module.exports = { definitions, handlers };
