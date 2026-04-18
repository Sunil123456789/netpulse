import { EventEmitter } from 'node:events'
import { jest } from '@jest/globals'

const httpRequest = jest.fn()

jest.unstable_mockModule('node:http', () => ({
  default: { request: httpRequest },
}))

jest.unstable_mockModule('node:https', () => ({
  default: { request: jest.fn() },
}))

const { ollamaProvider } = await import('../src/services/ai/providers/ollama.js')

function createMockRequest({ statusCode = 200, body = '{}' } = {}) {
  const req = new EventEmitter()
  req.setTimeout = jest.fn()
  req.write = jest.fn()
  req.destroy = jest.fn()
  req.end = jest.fn(() => {
    const [, onResponse] = httpRequest.mock.calls.at(-1)
    const res = new EventEmitter()
    res.statusCode = statusCode
    res.setEncoding = jest.fn()
    onResponse(res)
    res.emit('data', body)
    res.emit('end')
  })
  return req
}

beforeEach(() => {
  jest.clearAllMocks()
  ollamaProvider.authToken = ''
  ollamaProvider.authHeader = 'Authorization'
  ollamaProvider.authScheme = 'Bearer'
  ollamaProvider.extraHeaders = {}
})

describe('ollamaProvider.request', () => {
  test('resolves successful http responses without throwing cleanup errors', async () => {
    httpRequest.mockImplementation((_options, _onResponse) => createMockRequest({
      statusCode: 200,
      body: '{"models":[]}',
    }))

    await expect(ollamaProvider.request('api/tags')).resolves.toMatchObject({
      ok: true,
      status: 200,
      body: '{"models":[]}',
    })
  })

  test('maps prompt and completion token counts on chat responses', async () => {
    httpRequest.mockImplementation((_options, _onResponse) => createMockRequest({
      statusCode: 200,
      body: JSON.stringify({
        message: { content: 'hello' },
        prompt_eval_count: 12,
        eval_count: 8,
      }),
    }))

    const result = await ollamaProvider.chat([{ role: 'user', content: 'hi' }], 'system', 'auto')

    expect(result).toMatchObject({
      content: 'hello',
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      tokensUsed: 20,
      provider: 'ollama',
    })
  })

  test('passes generation controls through to the Ollama chat payload', async () => {
    let capturedPayload = null

    httpRequest.mockImplementation((_options, _onResponse) => {
      const req = createMockRequest({
        statusCode: 200,
        body: JSON.stringify({
          message: { content: '{}' },
          prompt_eval_count: 4,
          eval_count: 6,
        }),
      })
      req.write = jest.fn(payload => {
        capturedPayload = JSON.parse(payload)
      })
      return req
    })

    await ollamaProvider.chat(
      [{ role: 'user', content: 'hi' }],
      'system',
      'auto',
      { maxTokens: 128, temperature: 0.2 }
    )

    expect(capturedPayload).toMatchObject({
      stream: false,
      options: {
        num_predict: 128,
        temperature: 0.2,
      },
    })
  })

  test('honors per-request timeout overrides for chat calls', async () => {
    let requestRef = null

    httpRequest.mockImplementation((_options, _onResponse) => {
      requestRef = createMockRequest({
        statusCode: 200,
        body: JSON.stringify({
          message: { content: 'hello' },
          prompt_eval_count: 2,
          eval_count: 3,
        }),
      })
      return requestRef
    })

    await ollamaProvider.chat(
      [{ role: 'user', content: 'hi' }],
      'system',
      'auto',
      { timeoutMs: 9876 }
    )

    expect(requestRef.setTimeout).toHaveBeenCalledWith(9876, expect.any(Function))
  })

  test('includes configured auth headers on requests', async () => {
    let capturedOptions = null
    ollamaProvider.authToken = 'secret-token'
    ollamaProvider.authHeader = 'Authorization'
    ollamaProvider.authScheme = 'Bearer'
    ollamaProvider.extraHeaders = { 'X-Test': '1' }

    httpRequest.mockImplementation((options, _onResponse) => {
      capturedOptions = options
      return createMockRequest({
        statusCode: 200,
        body: '{"models":[]}',
      })
    })

    await ollamaProvider.request('api/tags')

    expect(capturedOptions.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
      'X-Test': '1',
    })
  })
})
