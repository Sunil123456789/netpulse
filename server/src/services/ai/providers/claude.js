import Anthropic from '@anthropic-ai/sdk'

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    this.defaultModel = 'claude-sonnet-4-20250514'
  }

  async chat(messages, systemPrompt, model = 'auto') {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const response = await this.client.messages.create({
      model: useModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    })

    return {
      content: response.content[0].text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
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
