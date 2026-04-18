import { EventEmitter } from 'node:events'
import { createRequestAbortSignal } from '../src/utils/requestAbort.js'

function buildRequestResponsePair() {
  const req = new EventEmitter()
  const res = new EventEmitter()
  res.writableEnded = false
  return { req, res }
}

describe('createRequestAbortSignal', () => {
  test('does not abort when the request close event fires after the body is read', () => {
    const { req, res } = buildRequestResponsePair()
    const { signal, cleanup } = createRequestAbortSignal(req, res)

    req.emit('close')

    expect(signal.aborted).toBe(false)
    cleanup()
  })

  test('aborts when the request is explicitly aborted by the client', () => {
    const { req, res } = buildRequestResponsePair()
    const { signal, cleanup } = createRequestAbortSignal(req, res)

    req.emit('aborted')

    expect(signal.aborted).toBe(true)
    cleanup()
  })

  test('aborts when the response closes before it is written', () => {
    const { req, res } = buildRequestResponsePair()
    const { signal, cleanup } = createRequestAbortSignal(req, res)

    res.emit('close')

    expect(signal.aborted).toBe(true)
    cleanup()
  })

  test('does not abort after the response has already completed', () => {
    const { req, res } = buildRequestResponsePair()
    const { signal, cleanup } = createRequestAbortSignal(req, res)

    res.writableEnded = true
    res.emit('close')

    expect(signal.aborted).toBe(false)
    cleanup()
  })
})
