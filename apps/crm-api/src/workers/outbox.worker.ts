import { db, outboxEvents, campaigns, segments, communications, campaignStats, campaignRuns } from '@xeno/db'
import { eq, isNull, sql } from 'drizzle-orm'
import { deliveryQueue } from '../queues/index.js'
import { createLogger } from '@xeno/logger'
import { makeKey } from '../lib/idempotency.js'
import { resolveSegmentCustomers, getSuppressedIds, getFrequencyCappedIds } from '../features/segments/segment.service.js'
import type { FilterRules } from '@xeno/types'
import { randomUUID } from 'node:crypto'

const log = createLogger('outbox-worker')

async function processOutbox() {
  // Atomically claim events: lock + mark published in ONE transaction.
  // Without this, the lock releases before handleCampaignLaunch finishes,
  // and the next poll cycle (3s later) re-picks the same row → duplicate launches.
  const claimed = await db.transaction(async (tx) => {
    const pending = await tx.execute(sql`
      SELECT * FROM outbox_events
      WHERE published_at IS NULL
      ORDER BY created_at
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `)
    if ((pending as any[]).length === 0) return []

    for (const row of pending as any[]) {
      await tx.update(outboxEvents)
        .set({ publishedAt: new Date() })
        .where(eq(outboxEvents.id, row.id))
    }
    return pending as any[]
  })

  // Process outside the transaction — row is already claimed, no re-processing possible
  for (const row of claimed) {
    try {
      if (row.event_type === 'campaign.launch') {
        await handleCampaignLaunch(row.payload as { campaignId: string; triggeredBy: string })
      }
    } catch (err) {
      log.error({ err, outboxId: row.id, eventType: row.event_type }, 'outbox processing failed (event already marked published)')
    }
  }
}

async function handleCampaignLaunch(payload: { campaignId: string; triggeredBy: string }) {
  const { campaignId, triggeredBy } = payload

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const [segment] = await db.select().from(segments).where(eq(segments.id, campaign.segmentId))
  if (!segment) throw new Error(`Segment ${campaign.segmentId} not found`)

  // Resolve eligible customers (suppression + freq cap already checked in validatePreLaunch)
  const allCustomers = await resolveSegmentCustomers(segment.filterRules as FilterRules, campaign.channel)
  const customerIds = allCustomers.map(c => c.id)
  const suppressed = await getSuppressedIds(customerIds, campaign.channel)
  const eligible = allCustomers.filter(c => !suppressed.includes(c.id))

  const runStarted = new Date()
  const [run] = await db.insert(campaignRuns).values({
    campaignId,
    startedAt: runStarted,
    totalQueued: eligible.length,
    workerConcurrency: 10,
    triggeredBy,
  }).returning()

  log.info({ campaignId, totalCustomers: eligible.length }, 'Fan-out: creating delivery jobs')

  // Fan-out: one BullMQ job per customer (backpressure: concurrency 10)
  const jobs = eligible.map(customer => ({
    name: 'send-communication',
    data: {
      communicationId: randomUUID(),
      campaignId,
      customerId: customer.id,
      channel: campaign.channel,
      message: campaign.messageTemplate
        .replace('{{name}}', customer.name)
        .replace('{{city}}', customer.city ?? 'there'),
      recipientPhone: customer.phone,
      recipientEmail: customer.email,
      correlationId: campaign.correlationId ?? randomUUID(),
    },
    opts: {
      delay: campaign.scheduledAt ? Math.max(0, campaign.scheduledAt.getTime() - Date.now()) : 0,
      jobId: makeKey(campaignId, customer.id),
    },
  }))

  await deliveryQueue.addBulk(jobs)

  // Pre-create communication records
  await db.insert(communications).values(
    eligible.map(customer => ({
      id: jobs.find(j => j.data.customerId === customer.id)!.data.communicationId,
      campaignId,
      customerId: customer.id,
      channel: campaign.channel,
      message: campaign.messageTemplate.replace('{{name}}', customer.name),
      status: 'queued' as const,
      idempotencyKey: makeKey(campaignId, customer.id),
      correlationId: campaign.correlationId ?? randomUUID(),
    }))
  ).onConflictDoNothing()

  await db.insert(campaignStats)
    .values({ campaignId })
    .onConflictDoNothing()

  log.info({ campaignId, jobsQueued: eligible.length, runId: run?.id }, 'Campaign fan-out complete')
}

// Poll every 3 seconds
export function startOutboxWorker() {
  log.info('Outbox worker started')
  setInterval(async () => {
    try { await processOutbox() } catch (err) { log.error({ err }, 'Outbox poll error') }
  }, 3000)
}
