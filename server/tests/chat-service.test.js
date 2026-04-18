import { jest } from '@jest/globals'

process.env.AI_CHAT_TIMEOUT_MS = '50'
process.env.AI_OLLAMA_CHAT_TIMEOUT_MS = '1000'

const mockTaskRouter = {
  resolveTaskTarget: jest.fn(),
  routeStream: jest.fn(),
  updateLastRun: jest.fn(),
  getProvider: jest.fn(),
}

const mockBuildContext = jest.fn()
const mockScoreResponse = jest.fn()
const mockBuildChatDisplay = jest.fn(() => null)
const mockBuildMetering = jest.fn(() => ({ provider: 'ollama', model: 'gemma4:e4b' }))
const mockStartExecutionLog = jest.fn()
const mockCompleteExecutionLog = jest.fn()
const mockFailExecutionLog = jest.fn()
const mockIsAbortError = jest.fn(() => false)
const mockOllamaProvider = {
  getStatus: jest.fn(),
  defaultModel: 'llama3',
  chatTimeoutMs: 0,
}

jest.unstable_mockModule('../src/services/ai/taskRouter.js', () => ({
  taskRouter: mockTaskRouter,
}))

jest.unstable_mockModule('../src/services/ai/context.js', () => ({
  buildContext: mockBuildContext,
}))

jest.unstable_mockModule('../src/services/ai/scorer.js', () => ({
  scoreResponse: mockScoreResponse,
}))

jest.unstable_mockModule('../src/services/ai/presentation.js', () => ({
  buildChatDisplay: mockBuildChatDisplay,
  buildMetering: mockBuildMetering,
}))

jest.unstable_mockModule('../src/services/ai/executionTracking.js', () => ({
  startExecutionLog: mockStartExecutionLog,
  completeExecutionLog: mockCompleteExecutionLog,
  failExecutionLog: mockFailExecutionLog,
  isAbortError: mockIsAbortError,
}))

jest.unstable_mockModule('../src/services/ai/providers/ollama.js', () => ({
  ollamaProvider: mockOllamaProvider,
}))

const { processChat } = await import('../src/services/ai/chat.js')

beforeEach(() => {
  jest.clearAllMocks()

  mockTaskRouter.resolveTaskTarget.mockResolvedValue({
    providerName: 'ollama',
    model: 'gemma4:e4b',
  })
  mockTaskRouter.getProvider.mockReturnValue({ chatTimeoutMs: 0 })
  mockTaskRouter.routeStream.mockResolvedValue({
    provider: 'ollama',
    model: 'gemma4:e4b',
    content: 'ready',
    responseTimeMs: 10,
    totalTokens: 5,
    promptTokens: 2,
    completionTokens: 3,
  })

  mockBuildContext.mockResolvedValue({
    text: 'context text',
    sources: [],
  })
  mockScoreResponse.mockResolvedValue({
    scores: {},
    totalScore: 5,
    scoreId: 'score-1',
  })
  mockStartExecutionLog.mockResolvedValue({ _id: 'log-1' })
  mockCompleteExecutionLog.mockResolvedValue(null)
  mockFailExecutionLog.mockResolvedValue(null)

  mockOllamaProvider.getStatus.mockResolvedValue({
    connected: true,
    models: [{ name: 'gemma4:e4b' }],
    requiresAuth: false,
    detail: null,
  })
})

describe('chat service', () => {
  test('fails fast with model_missing when the selected Ollama model is not installed', async () => {
    mockTaskRouter.resolveTaskTarget.mockResolvedValue({
      providerName: 'ollama',
      model: 'gemma2',
    })
    mockOllamaProvider.getStatus.mockResolvedValue({
      connected: true,
      models: [{ name: 'gemma4:e4b' }],
      requiresAuth: false,
      detail: null,
    })

    await expect(processChat({
      messages: [{ role: 'user', content: 'Summarize network status right now' }],
    })).rejects.toMatchObject({
      kind: 'model_missing',
      provider: 'ollama',
      model: 'gemma2',
      statusCode: 400,
    })

    expect(mockBuildContext).not.toHaveBeenCalled()
    expect(mockStartExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama',
      model: 'gemma2',
    }))
    expect(mockFailExecutionLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({
        kind: 'model_missing',
        provider: 'ollama',
        model: 'gemma2',
      }),
      expect.objectContaining({
        result: {
          provider: 'ollama',
          model: 'gemma2',
        },
      })
    )
  })

  test('fails fast with provider_auth when Ollama requires authentication', async () => {
    mockOllamaProvider.getStatus.mockResolvedValue({
      connected: false,
      models: [],
      requiresAuth: true,
      detail: 'https://ollama.smile4u.in/ollama returned HTTP 401. Configure OLLAMA_AUTH_TOKEN.',
    })

    await expect(processChat({
      messages: [{ role: 'user', content: 'Summarize network status right now' }],
    })).rejects.toMatchObject({
      kind: 'provider_auth',
      provider: 'ollama',
      model: 'gemma4:e4b',
      statusCode: 502,
    })

    expect(mockBuildContext).not.toHaveBeenCalled()
    expect(mockFailExecutionLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({
        kind: 'provider_auth',
        provider: 'ollama',
        model: 'gemma4:e4b',
      }),
      expect.objectContaining({
        result: {
          provider: 'ollama',
          model: 'gemma4:e4b',
        },
      })
    )
  })

  test('wraps long-running Ollama chat failures as structured timeout errors and preserves target metadata', async () => {
    mockTaskRouter.routeStream.mockImplementation(() => new Promise(() => {}))

    await expect(processChat({
      messages: [{ role: 'user', content: 'Summarize network status right now' }],
    })).rejects.toMatchObject({
      kind: 'timeout',
      provider: 'ollama',
      model: 'gemma4:e4b',
      statusCode: 504,
      timeoutMs: 1000,
    })

    expect(mockStartExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama',
      model: 'gemma4:e4b',
    }))
    expect(mockFailExecutionLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({
        kind: 'timeout',
        provider: 'ollama',
        model: 'gemma4:e4b',
        timeoutMs: 1000,
      }),
      expect.objectContaining({
        result: {
          provider: 'ollama',
          model: 'gemma4:e4b',
        },
      })
    )
  })
})
