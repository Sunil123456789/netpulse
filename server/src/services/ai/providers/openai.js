import OpenAI from 'openai'

class OpenAIProvider {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.defaultModel = 'gpt-4o'
  }

  async chat(messages, systemPrompt, model = 'auto') {
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
    })

    return {
      content: response.choices[0].message.content,
      tokensUsed: response.usage.total_tokens,
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
