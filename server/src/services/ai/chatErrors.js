const PROVIDER_UNREACHABLE_CODES = new Set([
  'EACCES',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
])

function formatChatTarget(provider, model) {
  return [provider, model].filter(Boolean).join(' / ') || 'Chat model'
}

function getDefaultStatusCode(kind = 'generic') {
  switch (kind) {
    case 'model_missing': return 400
    case 'provider_auth': return 502
    case 'provider_unreachable': return 503
    case 'timeout': return 504
    default: return 500
  }
}

function isProviderUnreachableError(err) {
  const code = String(err?.code || '').toUpperCase()
  if (PROVIDER_UNREACHABLE_CODES.has(code)) return true

  const message = String(err?.message || '').toLowerCase()
  return [
    'connection refused',
    'econnrefused',
    'enotfound',
    'host unreachable',
    'network is unreachable',
    'not reachable',
    'socket hang up',
  ].some(token => message.includes(token))
}

function isProviderAuthError(err) {
  const statusCode = Number(err?.statusCode || err?.status)
  if ([401, 403].includes(statusCode)) return true

  const message = String(err?.message || '').toLowerCase()
  return [
    '401',
    '403',
    'authentication required',
    'not authenticated',
    'unauthorized',
    'forbidden',
  ].some(token => message.includes(token))
}

class ChatError extends Error {
  constructor(kind, message, {
    statusCode = getDefaultStatusCode(kind),
    provider = null,
    model = null,
    timeoutMs = null,
    detail = null,
  } = {}) {
    super(message)
    this.name = 'ChatError'
    this.kind = kind || 'generic'
    this.statusCode = statusCode
    this.provider = provider
    this.model = model
    this.timeoutMs = timeoutMs
    this.detail = detail || message
  }
}

function createChatTimeoutError({
  provider = null,
  model = null,
  timeoutMs = null,
  detail = null,
} = {}) {
  const seconds = timeoutMs != null ? Math.round(timeoutMs / 1000) : null
  return new ChatError(
    'timeout',
    seconds != null
      ? `${formatChatTarget(provider, model)} timed out after ${seconds} seconds.`
      : `${formatChatTarget(provider, model)} timed out.`,
    {
      statusCode: 504,
      provider,
      model,
      timeoutMs,
      detail: detail || (timeoutMs != null ? `Chat model request timed out after ${timeoutMs}ms` : 'Chat model request timed out'),
    }
  )
}

function createModelMissingError({
  provider = 'ollama',
  model = null,
  detail = null,
} = {}) {
  return new ChatError(
    'model_missing',
    model
      ? `Ollama model '${model}' is not installed.`
      : 'The selected Ollama model is not installed.',
    {
      statusCode: 400,
      provider,
      model,
      detail: detail || (model
        ? `Install '${model}' in Ollama or choose another installed model.`
        : 'Install the selected Ollama model or choose another installed model.'),
    }
  )
}

function createProviderUnreachableError({
  provider = 'ollama',
  model = null,
  detail = null,
} = {}) {
  return new ChatError(
    'provider_unreachable',
    provider === 'ollama'
      ? 'Ollama is not reachable at the configured host.'
      : `${provider || 'The AI provider'} is not reachable.`,
    {
      statusCode: 503,
      provider,
      model,
      detail: detail || 'Provider connection failed.',
    }
  )
}

function createProviderAuthError({
  provider = 'ollama',
  model = null,
  detail = null,
} = {}) {
  return new ChatError(
    'provider_auth',
    provider === 'ollama'
      ? 'Ollama requires authentication at the configured host.'
      : `${provider || 'The AI provider'} requires authentication.`,
    {
      statusCode: 502,
      provider,
      model,
      detail: detail || 'Provider authentication failed.',
    }
  )
}

function normalizeChatError(err, {
  provider = null,
  model = null,
  timeoutMs = null,
} = {}) {
  if (err instanceof ChatError) {
    if (!err.provider) err.provider = provider
    if (!err.model) err.model = model
    if (err.timeoutMs == null && timeoutMs != null) err.timeoutMs = timeoutMs
    if (!err.statusCode) err.statusCode = getDefaultStatusCode(err.kind)
    return err
  }

  const kind = String(err?.kind || '').trim()

  if (kind === 'timeout' || /timed out|timeout/i.test(String(err?.message || ''))) {
    return createChatTimeoutError({
      provider,
      model,
      timeoutMs,
      detail: err?.message || null,
    })
  }

  if (kind === 'model_missing' || /model .*not found/i.test(String(err?.message || ''))) {
    return createModelMissingError({
      provider: provider || 'ollama',
      model,
      detail: err?.message || null,
    })
  }

  if (kind === 'provider_auth' || isProviderAuthError(err)) {
    return createProviderAuthError({
      provider,
      model,
      detail: err?.detail || err?.message || null,
    })
  }

  if (kind === 'provider_unreachable' || (provider === 'ollama' && isProviderUnreachableError(err))) {
    return createProviderUnreachableError({
      provider,
      model,
      detail: err?.message || null,
    })
  }

  return new ChatError(
    kind || 'generic',
    err?.message || 'Chat failed',
    {
      statusCode: err?.statusCode || getDefaultStatusCode(kind || 'generic'),
      provider,
      model,
      timeoutMs,
      detail: err?.detail || err?.message || 'Chat failed',
    }
  )
}

function buildChatErrorPayload(err, fallback = {}) {
  const chatError = normalizeChatError(err, fallback)
  return {
    error: chatError.message,
    message: chatError.message,
    kind: chatError.kind,
    provider: chatError.provider,
    model: chatError.model,
    timeoutMs: chatError.timeoutMs,
    detail: chatError.detail || chatError.message,
  }
}

export {
  ChatError,
  buildChatErrorPayload,
  createChatTimeoutError,
  createModelMissingError,
  createProviderAuthError,
  createProviderUnreachableError,
  formatChatTarget,
  isProviderAuthError,
  isProviderUnreachableError,
  normalizeChatError,
}
