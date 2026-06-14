import type { FastifyInstance } from 'fastify'
import { db, campaigns, campaignStats, events, customers, communications } from '@xeno/db'
import { desc, sql, eq } from 'drizzle-orm'

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/analytics/overview', async (request, reply) => {
    const [customerStats] = await db.execute(sql`
      SELECT
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE last_purchase_at > NOW() - INTERVAL '30 days') as active_customers,
        ROUND(AVG(lifetime_value)::numeric, 2) as avg_ltv,
        SUM(lifetime_value) as total_revenue
      FROM customers
    `)

    const [campaignSummary] = await db.execute(sql`
      SELECT
        COUNT(*) as total_campaigns,
        COUNT(*) FILTER (WHERE status = 'RUNNING') as active_campaigns,
        ROUND(AVG(CASE WHEN cs.sent_count > 0 THEN cs.delivered_count::float / cs.sent_count * 100 END)::numeric, 1) as avg_delivery_rate
      FROM campaigns c
      LEFT JOIN campaign_stats cs ON c.id = cs.campaign_id
    `)

    const [revenueStat] = await db.execute(sql`
      SELECT SUM(revenue_generated) as attributed_revenue FROM campaign_stats
    `)

    return reply.send({
      customers: customerStats,
      campaigns: campaignSummary,
      attributedRevenue: revenueStat,
    })
  })

  app.get('/analytics/funnel', async (request, reply) => {
    const { days = '30' } = request.query as any

    const [funnel] = await db.execute(sql`
      SELECT
        SUM(sent_count) as sent,
        SUM(delivered_count) as delivered,
        SUM(opened_count) as opened,
        SUM(read_count) as read,
        SUM(clicked_count) as clicked,
        SUM(revenue_generated) as revenue
      FROM campaign_stats cs
      JOIN campaigns c ON cs.campaign_id = c.id
      WHERE c.created_at > NOW() - INTERVAL '${sql.raw(days)} days'
    `)

    return reply.send(funnel)
  })

  app.get('/analytics/channel-performance', async (request, reply) => {
    const rows = await db.execute(sql`
      SELECT
        c.channel,
        COUNT(*) as total_campaigns,
        SUM(cs.sent_count) as total_sent,
        SUM(cs.delivered_count) as total_delivered,
        SUM(cs.opened_count) as total_opened,
        SUM(cs.clicked_count) as total_clicked,
        ROUND(AVG(CASE WHEN cs.delivered_count > 0 THEN cs.opened_count::float / cs.delivered_count * 100 END)::numeric, 1) as avg_open_rate,
        ROUND(AVG(CASE WHEN cs.opened_count > 0 THEN cs.clicked_count::float / cs.opened_count * 100 END)::numeric, 1) as avg_click_rate
      FROM campaigns c
      JOIN campaign_stats cs ON c.id = cs.campaign_id
      GROUP BY c.channel
    `)
    return reply.send(rows)
  })

  app.get('/analytics/top-campaigns', async (request, reply) => {
    const rows = await db.execute(sql`
      SELECT
        c.id, c.name, c.channel, c.created_at,
        cs.revenue_generated, cs.sent_count, cs.clicked_count
      FROM campaigns c
      JOIN campaign_stats cs ON c.id = cs.campaign_id
      ORDER BY cs.revenue_generated DESC
      LIMIT 5
    `)
    return reply.send(rows)
  })

  app.get('/analytics/revenue-by-week', async (request, reply) => {
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC('week', c.created_at) as week,
        SUM(cs.revenue_generated) as revenue
      FROM campaigns c
      JOIN campaign_stats cs ON c.id = cs.campaign_id
      GROUP BY DATE_TRUNC('week', c.created_at)
      ORDER BY week DESC
      LIMIT 8
    `)
    return reply.send(rows)
  })
}
