import { claudeProvider } from './providers/claude.js'
import { openaiProvider } from './providers/openai.js'
import { ollamaProvider } from './providers/ollama.js'
import AITaskConfig from '../../models/AITaskConfig.js'

class TaskRouter {
  getProvider(providerName) {
    switch (providerName) {
      case 'claude': return claudeProvider
      case 'openai': return openaiProvider
      case 'ollama': return ollamaProvider
      default:       return claudeProvider
    }
  }

  async getTaskConfig(task) {
    const config = await AITaskConfig.findOne({ task })
    if (!config) return { provider: 'claude', model: 'auto' }
    return config
  }

  async route(task, messages, systemPrompt, overrideProvider = null, overrideModel = null) {
    const config = await this.getTaskConfig(task)
    const providerName = overrideProvider || config.provider
    const model = overrideModel || config.model || 'auto'

    const provider = this.getProvider(providerName)

    if (!provider.isConfigured() && providerName !== 'ollama') {
      // fallback to ollama if configured provider has no API key
      const ollamaRunning = await ollamaProvider.isRunning()
      if (ollamaRunning) {
        console.log(`${providerName} not configured, falling back to ollama`)
        return await ollamaProvider.chat(messages, systemPrompt, 'auto')
      }
      throw new Error(`${providerName} API key not configured and Ollama not available`)
    }

    return await provider.chat(messages, systemPrompt, model)
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
