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

  async makeRequest(url, payload, method, timeoutMs, rejectUnauthorized, signal = null) {
    const transport = url.protocol === 'https:' ? https : http
    let cleanup = () => {}
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
      cleanup = this.bindAbortSignal(signal, err => req.destroy(err))

      if (payload) req.write(payload)
      req.end()
    })
      .finally(() => cleanup())
  }

  async request(endpoint, { method = 'GET', body = null, timeoutMs = 5000, signal = null } = {}) {
    const url = this.buildUrl(endpoint)
    const payload = body ? JSON.stringify(body) : null
    const rejectUnauthorized = !this.allowInsecureTls

    try {
      return await this.makeRequest(url, payload, method, timeoutMs, rejectUnauthorized, signal)
    } catch (err) {
      if (url.protocol === 'https:' && rejectUnauthorized && this.isRetryableTlsError(err)) {
        if (!this.warnedOnTlsRetry) {
          this.warnedOnTlsRetry = true
          console.warn(`Ollama TLS certificate is untrusted for ${url.origin}; retrying with insecure TLS`)
        }
        return await this.makeRequest(url, payload, method, timeoutMs, false, signal)
      }
      throw err
    }
  }

  makeAbortError() {
    const err = new Error('Ollama request aborted')
    err.name = 'AbortError'
    return err
  }

  bindAbortSignal(signal, destroy) {
    if (!signal) return () => {}
    if (signal.aborted) {
      destroy(this.makeAbortError())
      return () => {}
    }

    const onAbort = () => destroy(this.makeAbortError())
    signal.addEventListener('abort', onAbort)
    return () => signal.removeEventListener('abort', onAbort)
  }

  async chat(messages, systemPrompt, model = 'auto', options = {}) {
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
      signal: options.signal,
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

  async makeStreamingRequest(url, payload, timeoutMs, rejectUnauthorized, { onLine, signal } = {}) {
    const transport = url.protocol === 'https:' ? https : http

    return await new Promise((resolve, reject) => {
      let settled = false
      let cleanup = () => {}
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        cleanup()
        fn(value)
      }

      const req = transport.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        ...(url.protocol === 'https:' ? { rejectUnauthorized } : {}),
      }, res => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', chunk => { body += chunk })
          res.on('end', () => finish(reject, new Error(`Ollama error: ${res.statusCode}${body ? ` ${body}` : ''}`)))
          return
        }

        let buffer = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          buffer += chunk

          let newlineIndex = buffer.indexOf('\n')
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).trim()
            buffer = buffer.slice(newlineIndex + 1)
            if (line) onLine?.(line, finish)
            newlineIndex = buffer.indexOf('\n')
          }
        })

        res.on('end', () => {
          const finalLine = buffer.trim()
          if (finalLine) onLine?.(finalLine, finish)
          finish(resolve)
        })
      })

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Ollama request timed out after ${timeoutMs}ms`))
      })
      req.on('error', err => finish(reject, err))

      cleanup = this.bindAbortSignal(signal, err => req.destroy(err))

      req.write(payload)
      req.end()
    })
  }

  async streamChat(messages, systemPrompt, model = 'auto', { onToken, signal } = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const url = this.buildUrl('api/chat')
    const payload = JSON.stringify({
      model: useModel,
      messages: allMessages,
      stream: true,
      options: { num_predict: 2048 },
    })

    const execute = async (rejectUnauthorized) => {
      let content = ''
      let promptEvalCount = 0
      let evalCount = 0

      await this.makeStreamingRequest(
        url,
        payload,
        this.chatTimeoutMs,
        rejectUnauthorized,
        {
          signal,
          onLine: (line) => {
            let data
            try {
              data = JSON.parse(line)
            } catch {
              return
            }
            const delta = data.message?.content || ''
            if (delta) {
              content += delta
              onToken?.(delta)
            }
            promptEvalCount = data.prompt_eval_count ?? promptEvalCount
            evalCount = data.eval_count ?? evalCount
          },
        }
      )

      return {
        content,
        tokensUsed: promptEvalCount + evalCount,
        model: useModel,
        provider: 'ollama',
        responseTimeMs: Date.now() - startTime,
      }
    }

    try {
      return await execute(!this.allowInsecureTls)
    } catch (err) {
      if (url.protocol === 'https:' && !this.allowInsecureTls && this.isRetryableTlsError(err)) {
        if (!this.warnedOnTlsRetry) {
          this.warnedOnTlsRetry = true
          console.warn(`Ollama TLS certificate is untrusted for ${url.origin}; retrying with insecure TLS`)
        }
        return await execute(false)
      }
      throw err
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
