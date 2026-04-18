'use strict';

const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');

/**
 * Maps a NetPulse API HTTP error response to a typed McpError.
 * @param {number} status - HTTP status code
 * @param {object} data   - Parsed JSON body from the API
 */
function normalizeApiError(status, data) {
  let message = 'Unknown error';

  if (data?.details && Array.isArray(data.details)) {
    message = `${data.error || 'Validation error'}: ${data.details.join('; ')}`;
  } else if (data?.error) {
    message = data.error;
  } else if (typeof data === 'string') {
    message = data;
  }

  // Zabbix / ES degraded-mode response: { connected: false, degraded: true }
  if (data?.degraded) {
    const dep = data.dependency || 'external service';
    throw new McpError(
      ErrorCode.InternalError,
      `NetPulse: ${dep} is unavailable or not configured. Check the server environment for ${dep.toUpperCase()} credentials. Detail: ${message}`
    );
  }

  switch (status) {
    case 400:
      throw new McpError(ErrorCode.InvalidParams,   `NetPulse bad request (400): ${message}`);
    case 401:
      throw new McpError(ErrorCode.InvalidRequest,  `NetPulse auth error (401): ${message}. Check NETPULSE_TOKEN — it may be expired.`);
    case 403:
      throw new McpError(ErrorCode.InvalidRequest,  `NetPulse permission denied (403): ${message}. The token's role may lack access.`);
    case 404:
      throw new McpError(ErrorCode.InvalidRequest,  `NetPulse not found (404): ${message}`);
    case 503:
      throw new McpError(ErrorCode.InternalError,   `NetPulse service unavailable (503): ${message}`);
    default:
      throw new McpError(ErrorCode.InternalError,   `NetPulse API error (${status}): ${message}`);
  }
}

module.exports = { normalizeApiError };
