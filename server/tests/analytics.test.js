import { jest } from '@jest/globals'

const executionFind = jest.fn()
const executionCountDocuments = jest.fn()
const executionFindOne = jest.fn()
const scoreAggregate = jest.fn()

jest.unstable_mockModule('../src/models/AIExecutionLog.js', () => ({
  default: {
    find: executionFind,
    countDocuments: executionCountDocuments,
    findOne: executionFindOne,
  },
}))

jest.unstable_mockModule('../src/models/AIScore.js', () => ({
  default: {
    aggregate: scoreAggregate,
  },
}))

const {
  getAnalyticsOverview,
  getAnalyticsRuns,
} = await import('../src/services/ai/analytics.js')

function makeFindOverviewChain(rows) {
  return {
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(rows),
    }),
  }
}

function makeFindRunsChain(rows) {
  return {
    sort: jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  }
}

function makeFindOneChain(startedAt) {
  return {
    sort: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(startedAt ? { startedAt } : null),
      }),
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('analytics overview', () => {
  test('aggregates task and model usage with legacy summary', async () => {
    const rows = [
      {
        taskKey: 'ai.chat',
        domain: 'ai',
        provider: 'openai',
        model: 'gpt-4o',
        trigger: 'http',
        status: 'success',
        startedAt: new Date('2026-04-17T10:00:00.000Z'),
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        estimatedCostUsd: 0.0007,
        durationMs: 1200,
      },
      {
        taskKey: 'ai.chat',
        domain: 'ai',
        provider: 'openai',
        model: 'gpt-4o',
        trigger: 'http',
        status: 'failed',
        startedAt: new Date('2026-04-17T11:00:00.000Z'),
        promptTokens: 50,
        completionTokens: 0,
        totalTokens: 50,
        estimatedCostUsd: 0.00025,
        durationMs: 800,
      },
      {
        taskKey: 'ml.anomaly.detect',
        domain: 'ml',
        provider: null,
        model: null,
        trigger: 'http',
        status: 'success',
        startedAt: new Date('2026-04-17T12:00:00.000Z'),
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        durationMs: 3000,
      },
    ]

    executionFind.mockReturnValueOnce(makeFindOverviewChain(rows))
    executionFindOne.mockReturnValueOnce(makeFindOneChain(new Date('2026-04-17T10:00:00.000Z')))
    scoreAggregate.mockResolvedValueOnce([{
      totalRuns: 4,
      totalTokens: 400,
      avgResponseTimeMs: 900,
    }])

    const result = await getAnalyticsOverview({
      from: '2026-04-16T00:00:00.000Z',
      to: '2026-04-18T00:00:00.000Z',
    })

    expect(result.kpis).toMatchObject({
      totalRuns: 3,
      successfulRuns: 2,
      failedRuns: 1,
      canceledRuns: 0,
      promptTokens: 150,
      completionTokens: 40,
      totalTokens: 190,
    })
    expect(result.modelRows[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      totalRuns: 2,
      successfulRuns: 1,
      failedRuns: 1,
      totalTokens: 190,
    })
    expect(result.taskRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskKey: 'ai.chat', label: 'Chat', totalRuns: 2 }),
      expect.objectContaining({ taskKey: 'ml.anomaly.detect', label: 'Anomaly Detection', totalRuns: 1 }),
    ]))
    expect(result.legacySummary).toMatchObject({
      totalRuns: 4,
      totalTokens: 400,
      avgResponseTimeMs: 900,
    })
    expect(result.legacyNotice).toContain('Detailed execution tracking')
  })
})

describe('analytics runs', () => {
  test('returns paginated labeled run items', async () => {
    executionCountDocuments.mockResolvedValueOnce(3)
    executionFind.mockReturnValueOnce(makeFindRunsChain([
      {
        _id: 'run-1',
        taskKey: 'ai.chat',
        provider: 'openai',
        model: 'gpt-4o',
        status: 'success',
        startedAt: new Date('2026-04-17T10:00:00.000Z'),
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        durationMs: 1200,
      },
    ]))

    const result = await getAnalyticsRuns({
      from: '2026-04-17T00:00:00.000Z',
      to: '2026-04-18T00:00:00.000Z',
      page: 1,
      limit: 1,
    })

    expect(result).toMatchObject({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
    })
    expect(result.items[0]).toMatchObject({
      taskKey: 'ai.chat',
      label: 'Chat',
      provider: 'openai',
      model: 'gpt-4o',
    })
  })
})
