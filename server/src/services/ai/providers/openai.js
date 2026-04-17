import OpenAI from 'openai'

class OpenAIProvider {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4o'
  }

  async chat(messages, systemPrompt, model = 'auto', options = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const response = await this.client.chat.completions.create({
      model: useModel,
      messages: allMessages,
      max_tokens: 2048,
    }, { signal: options.signal })

    return {
      content: response.choices[0].message.content,
      tokensUsed: response.usage.total_tokens,
      model: useModel,
      provider: 'openai',
      responseTimeMs: Date.now() - startTime,
    }
  }

  async streamChat(messages, systemPrompt, model = 'auto', { onToken, signal } = {}) {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const stream = await this.client.chat.completions.create({
      model: useModel,
      messages: allMessages,
      max_tokens: 2048,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal })

    let content = ''
    let tokensUsed = 0

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (delta) {
        content += delta
        onToken?.(delta)
      }
      if (chunk.usage?.total_tokens != null) {
        tokensUsed = chunk.usage.total_tokens
      }
    }

    return {
      content,
      tokensUsed,
      model: useModel,
      provider: 'openai',
      responseTimeMs: Date.now() - startTime,
    }
  }

  isConfigured() {
    return !!process.env.OPENAI_API_KEY
  }
}

export const openaiProvider = new OpenAIProvider()
