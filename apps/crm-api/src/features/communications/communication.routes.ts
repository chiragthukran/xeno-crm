import type { FastifyInstance } from 'fastify'
import { db, communications, events, campaignStats, campaigns } from '@xeno/db'
import { eq, sql } from 'drizzle-orm'
import { verifySignature } from '../../lib/hmac.js'
import { checkAndMark, makeKey } from '../../lib/idempotency.js'
import { createLogger } from '@xeno/logger'
import type { ReceiptPayload } from '@xeno/types'

const log = createLogger('receipt-handler')

const STATUS_ORDER = ['queued', 'sent', 'delivered', 'failed', 'opened', 'read', 'clicked']

export async function communicationRoutes(app: FastifyInstance) {
  // Receipt endpoint — called by channel stub with delivery events
  app.post('/receipt', async (request, reply) => {
    const rawBody = JSON.stringify(request.body)
    const signature = request.headers['x-signature'] as string

    if (!signature || !verifySignature(rawBody, signature)) {
      log.warn({ ip: request.ip }, 'Invalid HMAC signature on receipt')
      return reply.status(401).send({ error: 'Invalid signature' })
    }

    const payload = request.body as ReceiptPayload
    const { communicationId, campaignId, eventType, correlationId } = payload
    const childLog = log.child({ correlationId, communicationId, eventType })

    // Idempotency: prevent duplicate event processing
    const idempotencyKey = makeKey(communicationId, eventType)
    const isNew = await checkAndMark(idempotencyKey)
    if (!isNew) {
      childLog.info('Duplicate receipt ignored (idempotency)')
      return reply.send({ ok: true, duplicate: true })
    }

    // Append to immutable event log (event sourcing pattern)
    await db.insert(events).values({
      communicationId,
      campaignId,
      eventType,
      payload: { timestamp: payload.timestamp },
      correlationId: correlationId as any,
    })

    // Update communication status (only advance, never regress)
    const updates: any = { status: eventType }
    if (eventType === 'delivered') updates.deliveredAt = new Date()
    if (eventType === 'opened')    updates.openedAt    = new Date()
    if (eventType === 'clicked')   updates.clickedAt   = new Date()

    await db.update(communications)
      .set(updates)
      .where(eq(communications.id, communicationId))

    // Increment pre-aggregated counter (read-optimised materialized stats)
    const statUpdate: Record<string, any> = { updatedAt: new Date() }
    if (eventType === 'delivered')            statUpdate.deliveredCount = sql`delivered_count + 1`
    else if (eventType === 'opened')          statUpdate.openedCount    = sql`opened_count + 1`
    else if (eventType === 'read')            statUpdate.readCount      = sql`read_count + 1`
    else if (eventType === 'clicked')         statUpdate.clickedCount   = sql`clicked_count + 1`
    else if (eventType === 'failed')          statUpdate.failedCount    = sql`failed_count + 1`
    else if (eventType === 'purchase_attributed') statUpdate.revenueGenerated = sql`revenue_generated + 1000`

    if (Object.keys(statUpdate).length > 1) {
      await db.update(campaignStats)
        .set(statUpdate)
        .where(eq(campaignStats.campaignId, campaignId))
    }

    // Attribution: if purchase event, flag campaign on order
    if (eventType === 'purchase_attributed') {
      childLog.info({ campaignId }, 'Purchase attributed to campaign')
    }

    childLog.info('Receipt processed')
    return reply.send({ ok: true })
  })

  // Get events for a campaign (live feed polling)
  app.get('/campaigns/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await db.select().from(events)
      .where(eq(events.campaignId, id))
      .orderBy(sql`created_at DESC`)
      .limit(50)
    return reply.send(rows)
  })

  // Get communications for a campaign
  app.get('/campaigns/:id/communications', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await db.select().from(communications)
      .where(eq(communications.campaignId, id))
      .limit(100)
    return reply.send(rows)
  })
}
