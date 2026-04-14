import { isIP } from 'node:net'
import mongoose from 'mongoose'

const USER_ROLES = ['admin', 'analyst', 'viewer']
const DEVICE_TYPES = ['fortigate', 'cisco-switch', 'cisco-router', 'other']
const DEVICE_STATUSES = ['online', 'offline', 'unknown']
const ALERT_TYPES = ['threshold', 'anomaly', 'pattern']
const ALERT_SOURCES = ['fortigate', 'cisco', 'all']
const ALERT_SEVERITIES = ['critical', 'high', 'medium', 'low']
const ALERT_ACTIONS = ['slack', 'email', 'ticket', 'webhook']

function failValidation(res, details) {
  return res.status(400).json({ error: 'Validation failed', details })
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => trimString(item)).filter(item => typeof item === 'string' && item)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }
  return null
}

function addRequiredString(payload, source, field, errors) {
  const value = trimString(source[field])
  if (!value) errors.push(`${field} is required`)
  else payload[field] = value
}

function addOptionalString(payload, source, field) {
  if (source[field] === undefined) return
  const value = trimString(source[field])
  payload[field] = value || ''
}

function addOptionalEnum(payload, source, field, allowed, errors) {
  if (source[field] === undefined) return
  const value = trimString(source[field])
  if (!allowed.includes(value)) errors.push(`${field} must be one of: ${allowed.join(', ')}`)
  else payload[field] = value
}

function addOptionalBoolean(payload, source, field, errors) {
  if (source[field] === undefined) return
  const parsed = parseBoolean(source[field])
  if (parsed === null) errors.push(`${field} must be true or false`)
  else payload[field] = parsed
}

function addOptionalObjectId(payload, source, field, errors, { required = false } = {}) {
  if (source[field] === undefined || source[field] === '') {
    if (required) errors.push(`${field} is required`)
    return
  }
  const value = trimString(source[field])
  if (!mongoose.Types.ObjectId.isValid(value)) errors.push(`${field} must be a valid id`)
  else payload[field] = value
}

function addOptionalInteger(payload, source, field, errors, { min = null, max = null } = {}) {
  if (source[field] === undefined || source[field] === '') return
  const parsed = parseInteger(source[field])
  if (parsed === null) {
    errors.push(`${field} must be an integer`)
    return
  }
  if (min !== null && parsed < min) {
    errors.push(`${field} must be at least ${min}`)
    return
  }
  if (max !== null && parsed > max) {
    errors.push(`${field} must be at most ${max}`)
    return
  }
  payload[field] = parsed
}

function addEmail(payload, source, field, errors, { required = false } = {}) {
  const raw = source[field]
  if (raw === undefined || raw === '') {
    if (required) errors.push(`${field} is required`)
    return
  }
  const value = trimString(raw)?.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${field} must be a valid email`)
  else payload[field] = value
}

function addPassword(payload, source, field, errors, { required = false } = {}) {
  const raw = source[field]
  if (raw === undefined || raw === '') {
    if (required) errors.push(`${field} is required`)
    return
  }
  if (typeof raw !== 'string' || raw.length < 6) errors.push(`${field} must be at least 6 characters`)
  else payload[field] = raw
}

function addIpAddress(payload, source, field, errors, { required = false } = {}) {
  const raw = source[field]
  if (raw === undefined || raw === '') {
    if (required) errors.push(`${field} is required`)
    return
  }
  const value = trimString(raw)
  if (!isIP(value)) errors.push(`${field} must be a valid IPv4 or IPv6 address`)
  else payload[field] = value
}

function normalizeAlertCondition(raw, errors) {
  if (raw === undefined || raw === null || raw === '') {
    return {
      threshold: 100,
      window: '5m',
      filters: [],
    }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('condition must be an object')
    return null
  }

  const thresholdRaw = raw.threshold ?? 100
  const threshold = parseInteger(thresholdRaw)
  if (threshold === null || threshold < 1) errors.push('condition.threshold must be a positive integer')

  const windowValue = trimString(raw.window || '5m')
  if (!windowValue) errors.push('condition.window is required')

  const filters = Array.isArray(raw.filters)
    ? raw.filters.filter(filter => filter && typeof filter === 'object' && !Array.isArray(filter))
    : []

  if (errors.length > 0) return null
  return {
    threshold,
    window: windowValue,
    filters,
  }
}

function ensureBodyHasFields(payload, errors) {
  if (Object.keys(payload).length === 0 && errors.length === 0) {
    errors.push('No valid fields provided')
  }
}

export function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return res.status(400).json({ error: `${paramName} must be a valid id` })
    }
    next()
  }
}

export function validateUserCreate(req, res, next) {
  const payload = {}
  const errors = []
  addRequiredString(payload, req.body, 'name', errors)
  addEmail(payload, req.body, 'email', errors, { required: true })
  addPassword(payload, req.body, 'password', errors, { required: true })
  addOptionalEnum(payload, req.body, 'role', USER_ROLES, errors)
  addOptionalBoolean(payload, req.body, 'active', errors)
  addOptionalString(payload, req.body, 'avatar')
  if (errors.length > 0) return failValidation(res, errors)
  req.body = payload
  next()
}

export function validateUserUpdate(req, res, next) {
  const payload = {}
  const errors = []
  addOptionalString(payload, req.body, 'name')
  addEmail(payload, req.body, 'email', errors)
  addOptionalEnum(payload, req.body, 'role', USER_ROLES, errors)
  addOptionalBoolean(payload, req.body, 'active', errors)
  addOptionalString(payload, req.body, 'avatar')
  ensureBodyHasFields(payload, errors)
  if (errors.length > 0) return failValidation(res, errors)
  req.body = payload
  next()
}

export function validateDeviceWrite(req, res, next) {
  const payload = {}
  const errors = []
  const isCreate = req.method === 'POST'

  if (isCreate) addRequiredString(payload, req.body, 'name', errors)
  else addOptionalString(payload, req.body, 'name')

  addIpAddress(payload, req.body, 'ip', errors, { required: isCreate })
  if (isCreate) addOptionalEnum(payload, req.body, 'type', DEVICE_TYPES, errors)
  else addOptionalEnum(payload, req.body, 'type', DEVICE_TYPES, errors)
  addOptionalObjectId(payload, req.body, 'site', errors, { required: isCreate })
  addOptionalEnum(payload, req.body, 'status', DEVICE_STATUSES, errors)
  addOptionalInteger(payload, req.body, 'syslogPort', errors, { min: 1, max: 65535 })
  addOptionalString(payload, req.body, 'notes')

  if (req.body.tags !== undefined) {
    const tags = parseStringArray(req.body.tags)
    if (tags === null) errors.push('tags must be a comma-separated string or array')
    else payload.tags = tags
  }

  if (isCreate && !payload.type && !errors.some(err => err.startsWith('type'))) {
    errors.push('type is required')
  }

  if (!isCreate) ensureBodyHasFields(payload, errors)
  if (errors.length > 0) return failValidation(res, errors)
  req.body = payload
  next()
}

export function validateSiteWrite(req, res, next) {
  const payload = {}
  const errors = []
  const isCreate = req.method === 'POST'

  if (isCreate) addRequiredString(payload, req.body, 'name', errors)
  else addOptionalString(payload, req.body, 'name')

  addOptionalString(payload, req.body, 'location')
  addOptionalString(payload, req.body, 'description')
  addOptionalString(payload, req.body, 'timezone')
  addOptionalBoolean(payload, req.body, 'active', errors)

  if (req.body.ipRanges !== undefined) {
    const ipRanges = parseStringArray(req.body.ipRanges)
    if (ipRanges === null) errors.push('ipRanges must be a comma-separated string or array')
    else payload.ipRanges = ipRanges
  }

  if (!isCreate) ensureBodyHasFields(payload, errors)
  if (errors.length > 0) return failValidation(res, errors)
  req.body = payload
  next()
}

export function validateAlertRuleWrite(req, res, next) {
  const payload = {}
  const errors = []
  const isCreate = req.method === 'POST'

  if (isCreate) addRequiredString(payload, req.body, 'name', errors)
  else addOptionalString(payload, req.body, 'name')

  addOptionalString(payload, req.body, 'description')
  addOptionalBoolean(payload, req.body, 'enabled', errors)
  addOptionalEnum(payload, req.body, 'type', ALERT_TYPES, errors)
  addOptionalEnum(payload, req.body, 'source', ALERT_SOURCES, errors)
  addOptionalEnum(payload, req.body, 'severity', ALERT_SEVERITIES, errors)
  addOptionalInteger(payload, req.body, 'cooldown', errors, { min: 0 })

  if (req.body.actions !== undefined) {
    const actions = parseStringArray(req.body.actions)
    if (actions === null) errors.push('actions must be a comma-separated string or array')
    else if (actions.some(action => !ALERT_ACTIONS.includes(action))) errors.push(`actions must be any of: ${ALERT_ACTIONS.join(', ')}`)
    else payload.actions = actions
  }

  if (isCreate || req.body.condition !== undefined) {
    const condition = normalizeAlertCondition(req.body.condition, errors)
    if (condition) payload.condition = condition
  }

  if (isCreate) {
    if (!payload.type && !errors.some(err => err.startsWith('type'))) errors.push('type is required')
    if (!payload.source && !errors.some(err => err.startsWith('source'))) errors.push('source is required')
  } else {
    ensureBodyHasFields(payload, errors)
  }

  if (errors.length > 0) return failValidation(res, errors)
  req.body = payload
  next()
}

export function sendWriteError(res, err) {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field'
    return res.status(400).json({ error: `${field} already exists` })
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }
  return res.status(500).json({ error: err.message })
}
