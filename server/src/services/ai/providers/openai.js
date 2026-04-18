import OpenAI from 'openai'
import { normalizeTokenUsage } from '../presentation.js'
import { createProviderTimeout, normalizeTimeoutMs } from '../../../utils/providerTimeout.js'

class OpenAIProvider {
  constructor() {
    this._client = null
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4o'
    this.requestTimeoutMs = normalizeTimeoutMs(
      process.env.OPENAI_TIMEOUT_MS || process.env.AI_PROVIDER_TIMEOUT_MS,
      90000
    )
  }

  get client() {
    if (!this._client) {
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this._client
  }

  resolveMaxTokens(options = {}) {
    const value = Number(options.maxTokens)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2048
  }

  async chat(messages, systemPrompt, model = 'auto', options = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, this.requestTimeoutMs)
    const timeout = createProviderTimeout({
      parentSignal: options.signal,
      timeoutMs,
      timeoutMessage: `OpenAI request timed out after ${timeoutMs}ms`,
    })

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]
    try {
      const response = await this.client.chat.completions.create({
        model: useModel,
        messages: allMessages,
        max_tokens: this.resolveMaxTokens(options),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
      }, { signal: timeout.signal })
      const usage = normalizeTokenUsage({
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      })

      return {
        content: response.choices[0].message.content,
        ...usage,
        model: useModel,
        provider: 'openai',
        responseTimeMs: Date.now() - startTime,
      }
    } catch (err) {
      if (timeout.didTimeout()) {
        throw new Error(`OpenAI request timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      timeout.cleanup()
    }
  }

  async streamChat(messages, systemPrompt, model = 'auto', options = {}) {
    const { onToken, signal } = options
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, this.requestTimeoutMs)
    const timeout = createProviderTimeout({
      parentSignal: signal,
      timeoutMs,
      timeoutMessage: `OpenAI request timed out after ${timeoutMs}ms`,
    })
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]
    try {
      const stream = await this.client.chat.completions.create({
        model: useModel,
        messages: allMessages,
        max_tokens: this.resolveMaxTokens(options),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: timeout.signal })

      let content = ''
      let usage = normalizeTokenUsage()

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) {
          content += delta
          onToken?.(delta)
        }
        if (chunk.usage?.total_tokens != null || chunk.usage?.prompt_tokens != null || chunk.usage?.completion_tokens != null) {
          usage = normalizeTokenUsage({
            promptTokens: chunk.usage?.prompt_tokens,
            completionTokens: chunk.usage?.completion_tokens,
            totalTokens: chunk.usage?.total_tokens,
          })
        }
      }

      return {
        content,
        ...usage,
        model: useModel,
        provider: 'openai',
        responseTimeMs: Date.now() - startTime,
      }
    } catch (err) {
      if (timeout.didTimeout()) {
        throw new Error(`OpenAI request timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      timeout.cleanup()
    }
  }

  isConfigured() {
    return !!process.env.OPENAI_API_KEY
  }
}

export const openaiProvider = new OpenAIProvider()
