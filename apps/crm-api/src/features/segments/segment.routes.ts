import type { FastifyInstance } from 'fastify'
import { db, segments } from '@xeno/db'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { previewSegment } from './segment.service.js'

const FilterConditionSchema = z.object({
  field: z.string(),
  op: z.enum(['gt','gte','lt','lte','eq','neq','days_ago_gt','days_ago_lt','contains','in']),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
})

const FilterRulesSchema = z.object({
  operator: z.enum(['AND', 'OR']),
  conditions: z.array(FilterConditionSchema).min(1),
})

const CreateSegmentSchema = z.object({
  name:             z.string().min(1).max(200),
  description:      z.string().optional(),
  nlQuery:          z.string().optional(),
  filterRules:      FilterRulesSchema,
  createdBy:        z.enum(['ai_agent', 'marketer']).default('marketer'),
  aiRationale:      z.string().optional(),
  estimatedSize:    z.number().optional(),
  estimatedRevenue: z.number().optional(),
})

export async function segmentRoutes(app: FastifyInstance) {
  app.get('/segments', async (request, reply) => {
    const rows = await db.select().from(segments).orderBy(desc(segments.createdAt))
    return reply.send(rows)
  })

  app.get('/segments/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [seg] = await db.select().from(segments).where(eq(segments.id, id))
    if (!seg) return reply.status(404).send({ error: 'Segment not found' })
    return reply.send(seg)
  })

  app.post('/segments', async (request, reply) => {
    const body = CreateSegmentSchema.parse(request.body)

    // Auto-preview before saving
    const preview = await previewSegment(body.filterRules as any)

    const [seg] = await db.insert(segments).values({
      ...body,
      estimatedSize: body.estimatedSize ?? preview.count,
    }).returning()

    return reply.status(201).send({ segment: seg, preview })
  })

  app.get('/segments/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [seg] = await db.select().from(segments).where(eq(segments.id, id))
    if (!seg) return reply.status(404).send({ error: 'Segment not found' })
    const preview = await previewSegment(seg.filterRules as any)
    return reply.send(preview)
  })

  app.delete('/segments/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await db.delete(segments).where(eq(segments.id, id))
    return reply.send({ ok: true })
  })
}
