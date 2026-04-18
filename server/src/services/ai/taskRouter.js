import { claudeProvider } from './providers/claude.js'
import { openaiProvider } from './providers/openai.js'
import { ollamaProvider } from './providers/ollama.js'
import AITaskConfig from '../../models/AITaskConfig.js'
import { getPreferredProvider } from '../../config/aiTaskDefaults.js'

class TaskRouter {
  resolveModelForProvider(providerName, model, provider) {
    if (!model || model === 'auto') {
      return providerName === 'ollama' ? provider?.defaultModel || 'llama3' : 'auto'
    }
    return model
  }

  getProvider(providerName) {
    switch (providerName) {
      case 'claude': return claudeProvider
      case 'openai': return openaiProvider
      case 'ollama': return ollamaProvider
      default:       return this.getProvider(getPreferredProvider())
    }
  }

  async getTaskConfig(task) {
    const config = await AITaskConfig.findOne({ task })
    if (!config) return { provider: getPreferredProvider(), model: 'auto' }
    return config
  }

  async resolveTaskTarget(task, overrideProvider = null, overrideModel = null) {
    const config = await this.getTaskConfig(task)
    const providerName = overrideProvider || config.provider
    const provider = this.getProvider(providerName)
    const hasProviderOverride = overrideProvider !== null && overrideProvider !== undefined && overrideProvider !== ''
    const requestedModel = overrideModel || (hasProviderOverride ? 'auto' : (config.model || 'auto'))

    return {
      providerName,
      model: this.resolveModelForProvider(providerName, requestedModel, provider),
      provider,
    }
  }

  shouldFallbackToOllama(err) {
    const message = String(err?.message || '').toLowerCase()
    return [
      'authentication',
      'api key',
      'unauthorized',
      'invalid x-api-key',
      'incorrect api key',
      '401',
      'fetch failed',
      'network',
      'connection',
      'econnrefused',
      'econnreset',
      'enotfound',
      'etimedout',
      'timed out',
      'timeout',
      'socket hang up',
    ].some(token => message.includes(token))
  }

  async route(task, messages, systemPrompt, overrideProvider = null, overrideModel = null, options = {}) {
    const { providerName, model, provider } = await this.resolveTaskTarget(task, overrideProvider, overrideModel)

    if (!provider.isConfigured() && providerName !== 'ollama') {
      // fallback to ollama if configured provider has no API key
      const ollamaRunning = await ollamaProvider.isRunning()
      if (ollamaRunning) {
        console.log(`${providerName} not configured, falling back to ollama`)
        return await ollamaProvider.chat(messages, systemPrompt, 'auto', options)
      }
      throw new Error(`${providerName} API key not configured and Ollama not available`)
    }

    try {
      return await provider.chat(messages, systemPrompt, model, options)
    } catch (err) {
      if (providerName !== 'ollama' && this.shouldFallbackToOllama(err)) {
        const ollamaRunning = await ollamaProvider.isRunning()
        if (ollamaRunning) {
          console.log(`${providerName} authentication failed, falling back to ollama`)
          return await ollamaProvider.chat(messages, systemPrompt, 'auto', options)
        }
      }
      throw err
    }
  }

  async routeStream(
    task,
    messages,
    systemPrompt,
    overrideProvider = null,
    overrideModel = null,
    handlers = {},
    signal = null,
    options = {}
  ) {
    const { providerName, model, provider } = await this.resolveTaskTarget(task, overrideProvider, overrideModel)
    const requestOptions = { ...options, signal, onToken: handlers.onToken }

    if (!provider.isConfigured() && providerName !== 'ollama') {
      const ollamaRunning = await ollamaProvider.isRunning()
      if (ollamaRunning) {
        handlers.onStage?.('fallback', `${providerName} unavailable, switching to Ollama`)
        return await ollamaProvider.streamChat(messages, systemPrompt, 'auto', requestOptions)
      }
      throw new Error(`${providerName} API key not configured and Ollama not available`)
    }

    try {
      if (typeof provider.streamChat === 'function') {
        return await provider.streamChat(messages, systemPrompt, model, requestOptions)
      }

      const result = await provider.chat(messages, systemPrompt, model, requestOptions)
      if (result.content) handlers.onToken?.(result.content)
      return result
    } catch (err) {
      if (providerName !== 'ollama' && this.shouldFallbackToOllama(err)) {
        const ollamaRunning = await ollamaProvider.isRunning()
        if (ollamaRunning) {
          handlers.onStage?.('fallback', `${providerName} failed, switching to Ollama`)
          return await ollamaProvider.streamChat(messages, systemPrompt, 'auto', requestOptions)
        }
      }
      throw err
    }
  }

  async updateLastRun(task, status, durationMs) {
    await AITaskConfig.findOneAndUpdate(
      { task },
      {
        lastRun: new Date(),
        lastRunStatus: status,
        lastRunDuration: durationMs,
        updatedAt: new Date(),
      }
    )
  }

  getProviderStatus() {
    return {
      claude: claudeProvider.isConfigured(),
      openai: openaiProvider.isConfigured(),
      ollama: ollamaProvider.isConfigured(),
    }
  }
}

export const taskRouter = new TaskRouter()
