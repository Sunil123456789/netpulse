'use strict';

const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');

const devices       = require('./devices.js');
const sites         = require('./sites.js');
const aiTaskConfigs = require('./aiTaskConfigs.js');

const ALL_RESOURCES = [devices, sites, aiTaskConfigs];

const definitions = ALL_RESOURCES.map(r => r.definition);

const READERS = Object.fromEntries(ALL_RESOURCES.map(r => [r.definition.uri, r.read]));

async function read(uri) {
  const reader = READERS[uri];
  if (!reader) {
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: "${uri}"`);
  }
  return reader();
}

module.exports = { definitions, read };
