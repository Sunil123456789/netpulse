import { claudeProvider } from './providers/claude.js'
import { openaiProvider } from './providers/openai.js'
import { ollamaProvider } from './providers/ollama.js'

const providers = { claude: claudeProvider, openai: openaiProvider, ollama: ollamaProvider }

export function getAIProvider() {
  const name = process.env.AI_PROVIDER || 'claude'
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown AI provider: ${name}`)
  return provider
}

export async function chat(messages, options = {}) {
  return getAIProvider().chat(messages, options)
}

export async function complete(prompt, options = {}) {
  return getAIProvider().complete(prompt, options)
}
