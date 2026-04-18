function normalizeTimeoutMs(value, fallbackMs) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs
}

function createProviderTimeout({ parentSignal = null, timeoutMs, timeoutMessage }) {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId = null

  const abort = (reason = new Error(timeoutMessage)) => {
    if (!controller.signal.aborted) {
      controller.abort(reason)
    }
  }

  const onParentAbort = () => {
    abort(parentSignal?.reason)
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abort(parentSignal.reason)
    } else {
      parentSignal.addEventListener('abort', onParentAbort)
    }
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true
      abort(new Error(timeoutMessage))
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort)
    },
  }
}

async function runWithTimeout(task, {
  parentSignal = null,
  timeoutMs,
  timeoutMessage,
} = {}) {
  const timeout = createProviderTimeout({
    parentSignal,
    timeoutMs,
    timeoutMessage,
  })

  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => {
      const reason = timeout.signal.reason
      if (timeout.didTimeout()) {
        reject(new Error(timeoutMessage))
        return
      }
      reject(reason instanceof Error ? reason : new Error('Request aborted'))
    }

    if (timeout.signal.aborted) {
      onAbort()
      return
    }

    timeout.signal.addEventListener('abort', onAbort, { once: true })
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => task(timeout.signal)),
      abortPromise,
    ])
  } finally {
    timeout.cleanup()
  }
}

export {
  createProviderTimeout,
  normalizeTimeoutMs,
  runWithTimeout,
}
