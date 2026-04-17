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
})
