import Anthropic from '@anthropic-ai/sdk'
import { normalizeTokenUsage } from '../presentation.js'
import { createProviderTimeout, normalizeTimeoutMs } from '../../../utils/providerTimeout.js'

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    this.defaultModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
    this.requestTimeoutMs = normalizeTimeoutMs(
      process.env.CLAUDE_TIMEOUT_MS || process.env.AI_PROVIDER_TIMEOUT_MS,
      90000
    )
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
      timeoutMessage: `Claude request timed out after ${timeoutMs}ms`,
    })

    try {
      const response = await this.client.messages.create({
        model: useModel,
        max_tokens: this.resolveMaxTokens(options),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
        system: systemPrompt,
        messages,
      }, { signal: timeout.signal })
      const usage = normalizeTokenUsage({
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      })

      return {
        content: response.content[0].text,
        ...usage,
        model: useModel,
        provider: 'claude',
        responseTimeMs: Date.now() - startTime,
      }
    } catch (err) {
      if (timeout.didTimeout()) {
        throw new Error(`Claude request timed out after ${timeoutMs}ms`)
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
      timeoutMessage: `Claude request timed out after ${timeoutMs}ms`,
    })

    try {
      const stream = await this.client.messages.create({
        model: useModel,
        max_tokens: this.resolveMaxTokens(options),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
        system: systemPrompt,
        messages,
        stream: true,
      }, { signal: timeout.signal })

      let content = ''
      let inputTokens = 0
      let outputTokens = 0

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message?.usage?.input_tokens || inputTokens
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const delta = event.delta.text || ''
          if (delta) {
            content += delta
            onToken?.(delta)
          }
        }

        if (event.type === 'message_delta') {
          inputTokens = event.usage?.input_tokens ?? inputTokens
          outputTokens = event.usage?.output_tokens ?? outputTokens
        }
      }

      const usage = normalizeTokenUsage({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
      })

      return {
        content,
        ...usage,
        model: useModel,
        provider: 'claude',
        responseTimeMs: Date.now() - startTime,
      }
    } catch (err) {
      if (timeout.didTimeout()) {
        throw new Error(`Claude request timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      timeout.cleanup()
    }
  }

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY
  }
}

export const claudeProvider = new ClaudeProvider()
