import Anthropic from '@anthropic-ai/sdk'

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    this.defaultModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
  }

  async chat(messages, systemPrompt, model = 'auto', options = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const response = await this.client.messages.create({
      model: useModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    }, { signal: options.signal })

    return {
      content: response.content[0].text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: useModel,
      provider: 'claude',
      responseTimeMs: Date.now() - startTime,
    }
  }

  async streamChat(messages, systemPrompt, model = 'auto', { onToken, signal } = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const stream = await this.client.messages.create({
      model: useModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }, { signal })

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

    return {
      content,
      tokensUsed: inputTokens + outputTokens,
      model: useModel,
      provider: 'claude',
      responseTimeMs: Date.now() - startTime,
    }
  }

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY
  }
}

export const claudeProvider = new ClaudeProvider()
