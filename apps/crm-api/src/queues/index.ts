import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

const makeRedis = () => new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })

export const redis = makeRedis()

// ── Delivery queue — high concurrency, latency-sensitive ──────────────────────
export const deliveryQueue = new Queue('campaign-delivery', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
  },
})

// ── AI queue — low concurrency, Gemini API rate limits apply ──────────────────
export const aiQueue = new Queue('ai-insights', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
})

export const deliveryQueueEvents = new QueueEvents('campaign-delivery', { connection: makeRedis() })
