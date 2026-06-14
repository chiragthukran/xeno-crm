import type { FastifyInstance } from 'fastify'
import { db, deadLetterJobs, suppressionList, frequencyCapRules } from '@xeno/db'
import { eq, isNull, desc } from 'drizzle-orm'
import { deliveryQueue } from '../../queues/index.js'
import { z } from 'zod'

export async function adminRoutes(app: FastifyInstance) {
  // DLQ — list failed jobs
  app.get('/admin/dlq', async (request, reply) => {
    const jobs = await db.select().from(deadLetterJobs).orderBy(desc(deadLetterJobs.failedAt)).limit(50)
    return reply.send(jobs)
  })

  // DLQ — retry a specific job
  app.post('/admin/dlq/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [job] = await db.select().from(deadLetterJobs).where(eq(deadLetterJobs.id, id))
    if (!job) return reply.status(404).send({ error: 'Job not found' })

    await deliveryQueue.add('send-communication', job.payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })

    await db.delete(deadLetterJobs).where(eq(deadLetterJobs.id, id))
    return reply.send({ ok: true, requeued: true })
  })

  // Queue stats
  app.get('/admin/queue-stats', async (request, reply) => {
    const [waiting, active, failed] = await Promise.all([
      deliveryQueue.getWaitingCount(),
      deliveryQueue.getActiveCount(),
      deliveryQueue.getFailedCount(),
    ])
    return reply.send({ waiting, active, failed })
  })

  // Suppression list
  app.get('/admin/suppression', async (request, reply) => {
    const rows = await db.select().from(suppressionList).orderBy(desc(suppressionList.suppressedAt))
    return reply.send(rows)
  })

  app.post('/admin/suppression', async (request, reply) => {
    const { customerId, email, channel, reason } = request.body as any
    const [row] = await db.insert(suppressionList).values({ customerId, email, channel, reason }).returning()
    return reply.status(201).send(row)
  })

  app.delete('/admin/suppression/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await db.delete(suppressionList).where(eq(suppressionList.id, id))
    return reply.send({ ok: true })
  })

  // Frequency cap rules
  app.get('/admin/frequency-caps', async (request, reply) => {
    const rows = await db.select().from(frequencyCapRules)
    return reply.send(rows)
  })

  app.put('/admin/frequency-caps', async (request, reply) => {
    const { channel, maxMessagesPerCustomer, windowDays } = request.body as any
    const [row] = await db.insert(frequencyCapRules)
      .values({ channel, maxMessagesPerCustomer, windowDays })
      .onConflictDoUpdate({
        target: frequencyCapRules.channel,
        set: { maxMessagesPerCustomer, windowDays, updatedAt: new Date() },
      })
      .returning()
    return reply.send(row)
  })
}
