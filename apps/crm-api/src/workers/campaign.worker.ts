import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { db, communications, events, deadLetterJobs, campaignStats } from '@xeno/db'
import { eq, sql } from 'drizzle-orm'
import { signPayload } from '../lib/hmac.js'
import { checkAndMark } from '../lib/idempotency.js'
import { createLogger } from '@xeno/logger'
import type { SendJobPayload } from '@xeno/types'

const log = createLogger('campaign-worker')
const CHANNEL_STUB_URL = process.env.CHANNEL_STUB_URL ?? 'http://localhost:3001'

// BullMQ requires a dedicated Redis connection per component — must NOT share with Queue
const workerRedis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })

// Delivery worker — high concurrency, latency-sensitive
export const campaignWorker = new Worker(
  'campaign-delivery',
  async (job) => {
    const payload = job.data as SendJobPayload
    const correlationLog = log.child({ correlationId: payload.correlationId, campaignId: payload.campaignId })

    const idempotencyKey = `send:${payload.communicationId}`
    const isNew = await checkAndMark(idempotencyKey)
    if (!isNew) {
      correlationLog.info({ communicationId: payload.communicationId }, 'Duplicate job skipped (idempotency)')
      return
    }

    const body = JSON.stringify({
      communicationId: payload.communicationId,
      campaignId: payload.campaignId,
      channel: payload.channel,
      message: payload.message,
      recipient: {
        phone: payload.recipientPhone,
        email: payload.recipientEmail,
      },
      correlationId: payload.correlationId,
    })

    const signature = signPayload(body)

    const res = await fetch(`${CHANNEL_STUB_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
        'x-correlation-id': payload.correlationId,
      },
      body,
    })

    if (!res.ok) {
      throw new Error(`Channel stub returned ${res.status}`)
    }

    await db.update(communications)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(communications.id, payload.communicationId))

    await db.insert(events).values({
      communicationId: payload.communicationId,
      campaignId: payload.campaignId,
      eventType: 'sent',
      payload: { channel: payload.channel },
      correlationId: payload.correlationId as any,
    })

    await db.update(campaignStats)
      .set({ sentCount: sql`sent_count + 1`, updatedAt: new Date() })
      .where(eq(campaignStats.campaignId, payload.campaignId))

    correlationLog.info({ communicationId: payload.communicationId }, 'Communication sent')
  },
  {
    connection: workerRedis,
    concurrency: 5, // reduced from 10 to leave DB pool headroom for API requests
  }
)

campaignWorker.on('failed', async (job, err) => {
  if (!job) return
  log.error({ jobId: job.id, err: err.message, attempts: job.attemptsMade }, 'Job failed after retries → DLQ')

  await db.insert(deadLetterJobs).values({
    jobId: job.id ?? '',
    queueName: 'campaign-delivery',
    payload: job.data,
    errorMessage: err.message,
    retryCount: job.attemptsMade,
  })
})

log.info({ concurrency: 10 }, 'Campaign delivery worker started')
