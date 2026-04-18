import { createProviderTimeout, normalizeTimeoutMs, runWithTimeout } from '../src/utils/providerTimeout.js'

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('provider timeout utility', () => {
  test('normalizes timeout values with a fallback', () => {
    expect(normalizeTimeoutMs('1500', 900)).toBe(1500)
    expect(normalizeTimeoutMs('nope', 900)).toBe(900)
    expect(normalizeTimeoutMs(0, 900)).toBe(900)
  })

  test('aborts when the timeout window elapses', async () => {
    const timeout = createProviderTimeout({
      timeoutMs: 20,
      timeoutMessage: 'Timed out',
    })

    await wait(40)

    expect(timeout.signal.aborted).toBe(true)
    expect(timeout.didTimeout()).toBe(true)
    timeout.cleanup()
  })

  test('mirrors parent aborts without marking a timeout', () => {
    const parent = new AbortController()
    const timeout = createProviderTimeout({
      parentSignal: parent.signal,
      timeoutMs: 500,
      timeoutMessage: 'Timed out',
    })

    parent.abort(new Error('Canceled by caller'))

    expect(timeout.signal.aborted).toBe(true)
    expect(timeout.didTimeout()).toBe(false)
    timeout.cleanup()
  })

  test('runWithTimeout rejects stalled work when the deadline is reached', async () => {
    await expect(runWithTimeout(
      () => new Promise(() => {}),
      {
        timeoutMs: 20,
        timeoutMessage: 'Work timed out',
      }
    )).rejects.toThrow('Work timed out')
  })
})
