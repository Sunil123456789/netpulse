'use strict';

const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { normalizeApiError }   = require('./errors.js');

const BASE_URL = (process.env.NETPULSE_URL || 'http://localhost:5000').replace(/\/$/, '');
const TOKEN    = process.env.NETPULSE_TOKEN || '';
const TIMEOUT  = parseInt(process.env.NETPULSE_TIMEOUT_MS || '15000', 10);

if (!TOKEN) {
  process.stderr.write('[netpulse-mcp] WARNING: NETPULSE_TOKEN is not set. All API calls will fail with 401.\n');
}

/**
 * Core HTTP request function.
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path   - e.g. '/api/ai/triage'
 * @param {object} opts
 * @param {object} [opts.query]  - Query string params (undefined/null values are skipped)
 * @param {object} [opts.body]   - JSON body for POST/PUT
 */
async function request(method, path, { query = {}, body } = {}) {
  const url = new URL(BASE_URL + path);

  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') {
      if (Array.isArray(v)) {
        v.forEach(item => url.searchParams.append(k, item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = { error: res.statusText || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      normalizeApiError(res.status, data);
    }

    return data;
  } catch (err) {
    if (err instanceof McpError) throw err;
    if (err.name === 'AbortError') {
      throw new McpError(
        ErrorCode.InternalError,
        `NetPulse request timed out after ${TIMEOUT}ms. Check NETPULSE_URL or increase NETPULSE_TIMEOUT_MS.`
      );
    }
    throw new McpError(ErrorCode.InternalError, `Network error reaching NetPulse: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  get:    (path, opts) => request('GET',    path, opts),
  post:   (path, opts) => request('POST',   path, opts),
  put:    (path, opts) => request('PUT',    path, opts),
  delete: (path, opts) => request('DELETE', path, opts),
};
