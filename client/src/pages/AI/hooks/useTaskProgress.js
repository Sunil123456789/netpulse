import { useEffect, useState } from 'react'

export function useTaskProgress(active, steps, intervalMs = 4000) {
  const [stageIndex, setStageIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(null)

  useEffect(() => {
    if (!active) {
      setStageIndex(0)
      setStartedAt(null)
      return undefined
    }

    setStageIndex(0)
    setStartedAt(Date.now())

    const timer = window.setInterval(() => {
      setStageIndex(prev => Math.min(prev + 1, Math.max(steps.length - 1, 0)))
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [active, intervalMs, steps.length])

  return {
    stageIndex,
    stageLabel: steps[stageIndex] || steps[0] || 'Working...',
    startedAt,
  }
}
