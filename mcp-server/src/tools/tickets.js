'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_tickets',
    description: 'List incident tickets in NetPulse. Filter by status, priority, or assignee. Returns ticket ID, title, description, status, priority, assignee, created date, and linked alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'open', 'in_progress', 'resolved', 'closed'],
          default: 'all',
        },
        priority: {
          type: 'string',
          enum: ['all', 'critical', 'high', 'medium', 'low'],
          default: 'all',
        },
        limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        page:   { type: 'integer', minimum: 0, default: 0 },
      },
      required: [],
    },
  },
  {
    name: 'create_ticket',
    description: 'Create a new incident ticket in NetPulse. Use this when triage recommends ticket creation or when an operator wants to track an incident.',
    inputSchema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Ticket title / short summary.' },
        description: { type: 'string', description: 'Full incident description.' },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          default: 'medium',
        },
        source:  { type: 'string', description: 'Source of the alert: firewall, cisco, edr, manual.' },
        alertData: { type: 'object', description: 'Raw alert data to attach to the ticket.' },
      },
      required: ['title', 'description'],
    },
  },
];

const handlers = {
  async get_tickets({ status = 'all', priority = 'all', limit = 20, page = 0 } = {}) {
    return client.get('/api/tickets', { query: { status, priority, limit, page } });
  },
  async create_ticket({ title, description, priority = 'medium', source, alertData } = {}) {
    return client.post('/api/tickets', { body: { title, description, priority, source, alertData } });
  },
};

module.exports = { definitions, handlers };
