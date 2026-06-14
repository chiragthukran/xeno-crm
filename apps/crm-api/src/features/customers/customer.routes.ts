import type { FastifyInstance } from 'fastify'
import { db, customers, customerInsights } from '@xeno/db'
import { eq, desc, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'

const CreateCustomerSchema = z.object({
  name:     z.string().min(1).max(200),
  email:    z.string().email(),
  phone:    z.string().optional(),
  city:     z.string().optional(),
  tags:     z.array(z.string()).optional(),
})

export async function customerRoutes(app: FastifyInstance) {
  app.get('/customers', async (request, reply) => {
    const { search, filter, limit = '50', offset = '0' } = request.query as any

    let query = db.select({
      customer: customers,
      insight: customerInsights,
    })
    .from(customers)
    .leftJoin(customerInsights, eq(customers.id, customerInsights.customerId))
    .$dynamic()

    if (search) query = query.where(ilike(customers.name, `%${search}%`))
    if (filter === 'vip')     query = query.where(sql`${customers.tags} @> ARRAY['vip']::text[]`)
    if (filter === 'at-risk') query = query.where(sql`${customers.tags} @> ARRAY['at-risk']::text[]`)
    if (filter === 'active')  query = query.where(sql`${customers.lastPurchaseAt} > NOW() - INTERVAL '30 days'`)

    const rows = await query
      .orderBy(desc(customers.lifetimeValue))
      .limit(Number(limit))
      .offset(Number(offset))

    return reply.send(rows)
  })

  app.get('/customers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await db.select().from(customers).where(eq(customers.id, id))
    if (!row) return reply.status(404).send({ error: 'Customer not found' })
    return reply.send(row)
  })

  app.post('/customers', async (request, reply) => {
    const body = CreateCustomerSchema.parse(request.body)
    const [customer] = await db.insert(customers).values(body).returning()
    return reply.status(201).send(customer)
  })

  // Bulk import endpoint
  app.post('/customers/import', async (request, reply) => {
    const { rows } = request.body as { rows: any[] }
    const validated = rows.map(r => CreateCustomerSchema.parse(r))
    const inserted = await db.insert(customers).values(validated).onConflictDoNothing().returning()
    return reply.status(201).send({ imported: inserted.length })
  })

  app.get('/customers/stats/summary', async (request, reply) => {
    const [summary] = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tags @> ARRAY['vip']::text[]) as vip_count,
        COUNT(*) FILTER (WHERE tags @> ARRAY['at-risk']::text[]) as at_risk_count,
        ROUND(AVG(lifetime_value)::numeric, 2) as avg_ltv,
        SUM(lifetime_value) as total_revenue
      FROM customers
    `)
    return reply.send(summary)
  })
}
