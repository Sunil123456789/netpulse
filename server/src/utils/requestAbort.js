function createRequestAbortSignal(req, res) {
  const controller = new AbortController()

  const abort = () => {
    if (!res.writableEnded && !controller.signal.aborted) {
      controller.abort()
    }
  }

  req.on('aborted', abort)
  res.on('close', abort)

  return {
    signal: controller.signal,
    cleanup: () => {
      req.off('aborted', abort)
      res.off('close', abort)
    },
  }
}

export { createRequestAbortSignal }
