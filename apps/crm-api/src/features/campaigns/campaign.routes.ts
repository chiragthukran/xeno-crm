import type { FastifyInstance } from 'fastify'
import { db, campaigns, campaignStats, segments } from '@xeno/db'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { validatePreLaunch, transitionCampaign, enqueueCampaign, initCampaignStats } from './campaign.service.js'

const CreateCampaignSchema = z.object({
  name:              z.string().min(1).max(200),
  segmentId:         z.string().uuid(),
  messageTemplate:   z.string().min(10).max(2000),
  channel:           z.enum(['whatsapp', 'sms', 'email', 'rcs']),
  sendRatePerMinute: z.number().min(1).max(1000).default(100),
  scheduledAt:       z.string().datetime().optional(),
  createdBy:         z.enum(['ai_agent', 'marketer']).default('marketer'),
})

export async function campaignRoutes(app: FastifyInstance) {
  app.get('/campaigns', async (request, reply) => {
    const rows = await db.select({
      campaign: campaigns,
      stats: campaignStats,
      segment: { name: segments.name, estimatedSize: segments.estimatedSize },
    })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaigns.id, campaignStats.campaignId))
    .leftJoin(segments, eq(campaigns.segmentId, segments.id))
    .orderBy(desc(campaigns.createdAt))

    return reply.send(rows)
  })

  app.get('/campaigns/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await db.select({
      campaign: campaigns,
      stats: campaignStats,
    })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaigns.id, campaignStats.campaignId))
    .where(eq(campaigns.id, id))

    if (!row) return reply.status(404).send({ error: 'Campaign not found' })
    return reply.send(row)
  })

  app.post('/campaigns', async (request, reply) => {
    const body = CreateCampaignSchema.parse(request.body)
    const [campaign] = await db.insert(campaigns).values({
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      status: 'DRAFT',
    }).returning()
    return reply.status(201).send(campaign)
  })

  app.post('/campaigns/:id/launch', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { triggeredBy = 'marketer' } = (request.body as any) ?? {}

    await transitionCampaign(id, 'VALIDATING')
    const validation = await validatePreLaunch(id)

    if (!validation.pass) {
      await transitionCampaign(id, validation.nextState)
      return reply.status(422).send({ error: validation.reason, validation })
    }

    await transitionCampaign(id, 'APPROVED')
    await transitionCampaign(id, 'QUEUED')
    await transitionCampaign(id, 'RUNNING')
    await initCampaignStats(id)
    await enqueueCampaign(id, triggeredBy)

    return reply.send({ ok: true, validation })
  })

  app.patch('/campaigns/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    const updated = await transitionCampaign(id, status as any)
    return reply.send(updated)
  })

  app.get('/campaigns/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [stats] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, id))
    return reply.send(stats ?? {})
  })
}
