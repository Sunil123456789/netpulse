import http from 'node:http'
import https from 'node:https'

class OllamaProvider {
  constructor() {
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434'
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama3'
    this.chatTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 180000)
    this.allowInsecureTls = String(process.env.OLLAMA_INSECURE_TLS || '').trim().toLowerCase() === 'true'
    this.warnedOnTlsRetry = false
  }

  buildUrl(endpoint) {
    const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`
    return new URL(endpoint.replace(/^\/+/, ''), normalizedBase)
  }

  isRetryableTlsError(err) {
    const code = String(err?.code || '').toUpperCase()
    return [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(code)
  }

  async makeRequest(url, payload, method, timeoutMs, rejectUnauthorized) {
    const transport = url.protocol === 'https:' ? https : http
    return await new Promise((resolve, reject) => {
      const req = transport.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          ...(payload ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          } : {}),
        },
        ...(url.protocol === 'https:' ? { rejectUnauthorized } : {}),
      }, res => {
        let responseBody = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { responseBody += chunk })
        res.on('end', () => {
          resolve({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            status: res.statusCode || 0,
            body: responseBody,
          })
        })
      })

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Ollama request timed out after ${timeoutMs}ms`))
      })
      req.on('error', reject)

      if (payload) req.write(payload)
      req.end()
    })
  }

  async request(endpoint, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
    const url = this.buildUrl(endpoint)
    const payload = body ? JSON.stringify(body) : null
    const rejectUnauthorized = !this.allowInsecureTls

    try {
      return await this.makeRequest(url, payload, method, timeoutMs, rejectUnauthorized)
    } catch (err) {
      if (url.protocol === 'https:' && rejectUnauthorized && this.isRetryableTlsError(err)) {
        if (!this.warnedOnTlsRetry) {
          this.warnedOnTlsRetry = true
          console.warn(`Ollama TLS certificate is untrusted for ${url.origin}; retrying with insecure TLS`)
        }
        return await this.makeRequest(url, payload, method, timeoutMs, false)
      }
      throw err
    }
  }

  async chat(messages, systemPrompt, model = 'auto') {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const response = await this.request('api/chat', {
      method: 'POST',
      body: {
        model: useModel,
        messages: allMessages,
        stream: false,
        options: { num_predict: 2048 },
      },
      timeoutMs: this.chatTimeoutMs,
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = JSON.parse(response.body)

    return {
      content: data.message?.content || '',
      tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      model: useModel,
      provider: 'ollama',
      responseTimeMs: Date.now() - startTime,
    }
  }

  async listModels() {
    try {
      const response = await this.request('api/tags', { timeoutMs: 5000 })
      if (!response.ok) return []
      const data = JSON.parse(response.body)
      return data.models || []
    } catch {
      return []
    }
  }

  async pullModel(modelName) {
    const response = await this.request('api/pull', {
      method: 'POST',
      body: { name: modelName, stream: false },
      timeoutMs: 300000,
    })
    if (!response.ok) throw new Error(`Pull failed: ${response.status}`)
    return JSON.parse(response.body)
  }

  async isRunning() {
    try {
      const response = await this.request('api/tags', { timeoutMs: 3000 })
      return response.ok
    } catch {
      return false
    }
  }

  isConfigured() {
    return !!process.env.OLLAMA_HOST
  }
}

export const ollamaProvider = new OllamaProvider()
