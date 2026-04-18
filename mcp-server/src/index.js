#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { Server }              = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport }= require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const tools     = require('./tools/index.js');
const resources = require('./resources/index.js');

const server = new Server(
  {
    name:    'netpulse-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools:     {},
      resources: {},
    },
  }
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: tools.definitions,
}));

// Execute a tool call
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  return tools.dispatch(req.params);
});

// List all available resources
server.setRequestHandler(ListResourcesRequestSchema, () => ({
  resources: resources.definitions,
}));

// Read a resource by URI
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  return resources.read(req.params.uri);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[netpulse-mcp] Server started. Listening on stdio.\n');
  process.stderr.write(`[netpulse-mcp] NetPulse URL: ${process.env.NETPULSE_URL || 'http://localhost:5000'}\n`);
  process.stderr.write(`[netpulse-mcp] Tools: ${tools.definitions.length} | Resources: ${resources.definitions.length}\n`);
}

main().catch(err => {
  process.stderr.write(`[netpulse-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
