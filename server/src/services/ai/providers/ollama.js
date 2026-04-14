class OllamaProvider {
  constructor() {
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434'
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama3'
  }

  async chat(messages, systemPrompt, model = 'auto') {
    const useModel = model === 'auto' ? this.defaultModel : model
    const startTime = Date.now()

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        messages: allMessages,
        stream: false,
        options: { num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = await response.json()

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
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.models || []
    } catch {
      return []
    }
  }

  async pullModel(modelName) {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
      signal: AbortSignal.timeout(300000),
    })
    if (!response.ok) throw new Error(`Pull failed: ${response.status}`)
    return await response.json()
  }

  async isRunning() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
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
