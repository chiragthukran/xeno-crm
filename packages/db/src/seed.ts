import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'
import { sql } from 'drizzle-orm'

const connStr = process.env.DATABASE_URL!
const isPooler = connStr.includes('.pooler.supabase.com')
const client = postgres(connStr, { max: 1, prepare: !isPooler, ...(isPooler ? { connection: { search_path: 'public' } } : {}) })
const db = drizzle(client, { schema })

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat']
const CHANNELS = ['whatsapp', 'email', 'sms', 'rcs'] as const
const FIRST_NAMES = ['Priya', 'Rahul', 'Sneha', 'Arjun', 'Divya', 'Kiran', 'Neha', 'Vikram', 'Pooja', 'Amit', 'Riya', 'Sanjay', 'Meera', 'Rohit', 'Ananya', 'Deepak', 'Kavya', 'Suresh', 'Shruti', 'Manish', 'Aisha', 'Farhan', 'Zoya', 'Kabir', 'Nisha']
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Joshi', 'Verma', 'Mishra', 'Agarwal', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Malik']
const PRODUCTS = ['Silk Kurta Set', 'Embroidered Saree', 'Linen Blazer', 'Cashmere Shawl', 'Designer Lehenga', 'Premium Denim', 'Ethnic Fusion Jacket', 'Cotton Coord Set', 'Formal Shirt Pack', 'Party Gown']

function rand(min: number, max: number) { return Math.random() * (max - min) + min }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)) }
function pick<T>(arr: readonly T[] | T[]): T { return arr[Math.floor(Math.random() * arr.length)]! }
function daysAgo(days: number) { return new Date(Date.now() - days * 86400000) }

async function seed() {
  console.log('🧹 Clearing existing data...')

  // Clear in FK-safe order
  await db.execute(sql`TRUNCATE TABLE agent_conversations, dead_letter_jobs, outbox_events, processed_events, events, communications, campaign_stats, campaign_runs, campaigns, customer_insights, orders, suppression_list, frequency_cap_rules, segments, customers RESTART IDENTITY CASCADE`)

  console.log('✅ Cleared. Seeding Luxe Fashion database...\n')

  // ── Frequency cap rules ───────────────────────────────────────────────────
  await db.insert(schema.frequencyCapRules).values([
    { channel: 'email',     maxMessagesPerCustomer: 3, windowDays: 7 },
    { channel: 'sms',       maxMessagesPerCustomer: 3, windowDays: 7 },
    { channel: 'whatsapp',  maxMessagesPerCustomer: 5, windowDays: 7 },
    { channel: 'rcs',       maxMessagesPerCustomer: 3, windowDays: 7 },
  ])
  console.log('✅ Frequency cap rules')

  // ── Suppression list ──────────────────────────────────────────────────────
  await db.insert(schema.suppressionList).values([
    { email: 'bounce@hardbounce.com',    channel: null,      reason: 'hard_bounce' },
    { email: 'spam.trap@honeypot.net',   channel: null,      reason: 'spam_complaint' },
    { email: 'unsubscribed@gmail.com',   channel: 'email',   reason: 'unsubscribe' },
    { email: 'dnd@jio.com',              channel: 'sms',     reason: 'dnd_registry' },
    { email: 'angry@customer.com',       channel: null,      reason: 'manual_block' },
  ])
  console.log('✅ Suppression list')

  // ── Customers ─────────────────────────────────────────────────────────────
  const customerMeta: Array<{
    persona: 'vip' | 'regular' | 'at-risk'
    ltv: number
    orders: number
    daysSincePurchase: number
    churnRisk: number
    engagementScore: number
    preferredChannel: string
  }> = []

  const customerRows = []
  for (let i = 0; i < 500; i++) {
    const firstName = pick(FIRST_NAMES)
    const lastName  = pick(LAST_NAMES)
    const name      = `${firstName} ${lastName}`
    const email     = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`
    const roll      = Math.random()

    let ltv: number, orders: number, daysSincePurchase: number, churnRisk: number, engagementScore: number
    let persona: 'vip' | 'regular' | 'at-risk'
    let tags: string[]

    if (roll < 0.18) {
      // 18% — VIP Shoppers
      persona          = 'vip'
      ltv              = rand(8000, 30000)
      orders           = randInt(8, 35)
      daysSincePurchase = randInt(1, 18)
      churnRisk        = rand(0.0, 0.18)
      engagementScore  = rand(78, 100)
      tags             = ['vip', 'loyal']
    } else if (roll < 0.55) {
      // 37% — Regular / Occasional
      persona          = 'regular'
      ltv              = rand(2000, 8000)
      orders           = randInt(2, 8)
      daysSincePurchase = randInt(10, 50)
      churnRisk        = rand(0.2, 0.45)
      engagementScore  = rand(40, 75)
      tags             = ['regular']
    } else if (roll < 0.75) {
      // 20% — Dormant High-Value (the win-back target)
      persona          = 'regular'
      ltv              = rand(3500, 12000)
      orders           = randInt(3, 10)
      daysSincePurchase = randInt(46, 120)
      churnRisk        = rand(0.4, 0.65)
      engagementScore  = rand(25, 50)
      tags             = ['regular']
    } else {
      // 25% — At-risk / churned
      persona          = 'at-risk'
      ltv              = rand(500, 3000)
      orders           = randInt(1, 4)
      daysSincePurchase = randInt(60, 200)
      churnRisk        = rand(0.65, 1.0)
      engagementScore  = rand(3, 35)
      tags             = ['at-risk']
    }

    const avgOrder         = ltv / orders
    const preferredChannel = pick(CHANNELS)

    customerMeta.push({ persona, ltv, orders, daysSincePurchase, churnRisk, engagementScore, preferredChannel })
    customerRows.push({
      name, email,
      phone:          `+91${randInt(7000000000, 9999999999)}`,
      city:           pick(CITIES),
      tags,
      lifetimeValue:  ltv.toFixed(2),
      avgOrderValue:  avgOrder.toFixed(2),
      totalOrders:    orders,
      lastPurchaseAt: daysAgo(daysSincePurchase),
      preferredChannel,
    })
  }

  const inserted = await db.insert(schema.customers).values(customerRows).returning()
  console.log(`✅ ${inserted.length} customers`)

  // ── Orders ────────────────────────────────────────────────────────────────
  const orderRows = []
  for (let i = 0; i < inserted.length; i++) {
    const c    = inserted[i]!
    const meta = customerMeta[i]!
    const n    = meta.orders

    for (let j = 0; j < n; j++) {
      const daysBack  = j === 0 ? meta.daysSincePurchase : randInt(meta.daysSincePurchase + j * 15, meta.daysSincePurchase + j * 30)
      const amount    = rand(800, Number(c.avgOrderValue) * 1.5)
      const statuses  = ['delivered', 'delivered', 'delivered', 'returned', 'cancelled']
      orderRows.push({
        customerId:    c.id,
        orderNumber:   `LF-${String(i).padStart(4,'0')}-${String(j).padStart(2,'0')}`,
        amount:        amount.toFixed(2),
        status:        pick(statuses),
        productNames:  [pick(PRODUCTS), ...(Math.random() > 0.6 ? [pick(PRODUCTS)] : [])],
        orderedAt:     daysAgo(daysBack),
      })
    }
  }

  // Insert in batches of 200
  for (let i = 0; i < orderRows.length; i += 200) {
    await db.insert(schema.orders).values(orderRows.slice(i, i + 200))
  }
  console.log(`✅ ${orderRows.length} orders`)

  // ── Customer insights ─────────────────────────────────────────────────────
  const insightRows = inserted.map((c, i) => {
    const meta = customerMeta[i]!
    return {
      customerId:           c.id,
      lifetimeValue:        c.lifetimeValue,
      avgOrderValue:        c.avgOrderValue,
      engagementScore:      meta.engagementScore.toFixed(2),
      churnRisk:            meta.churnRisk.toFixed(3),
      preferredChannel:     meta.preferredChannel,
      daysSinceLastPurchase: meta.daysSincePurchase,
      lastInteraction:      daysAgo(randInt(0, Math.min(meta.daysSincePurchase, 30))),
    }
  })
  await db.insert(schema.customerInsights).values(insightRows)
  console.log(`✅ ${insightRows.length} customer insights`)

  // ── Segments ──────────────────────────────────────────────────────────────
  const vipCount     = inserted.filter((_, i) => customerMeta[i]!.persona === 'vip').length
  const dormantCount = inserted.filter((_, i) => Number(customerMeta[i]!.ltv) > 3000 && customerMeta[i]!.daysSincePurchase > 45).length
  const atRiskCount  = inserted.filter((_, i) => customerMeta[i]!.persona === 'at-risk').length

  const [vipSeg, dormantSeg, atriskSeg, smsSeg, newSeg] = await db.insert(schema.segments).values([
    {
      name:           'VIP Shoppers',
      description:    'LTV > ₹8,000 with 8+ orders — our highest-value cohort',
      nlQuery:        'High value loyal customers who buy frequently',
      filterRules:    { operator: 'AND', conditions: [{ field: 'lifetime_value', op: 'gt', value: 8000 }, { field: 'total_orders', op: 'gte', value: 8 }] },
      estimatedSize:  vipCount,
      estimatedRevenue: 1200000,
      createdBy:      'ai_agent',
      aiRationale:    'Top 18% of your customer base by value. They respond best to exclusivity and early access — not discounts. Average 3.4x ROAS on campaigns. Do NOT over-message this segment.',
    },
    {
      name:           'Dormant High-Value',
      description:    'LTV > ₹3,500 but no purchase in 45+ days — prime win-back targets',
      nlQuery:        'High value customers who haven\'t bought recently',
      filterRules:    { operator: 'AND', conditions: [{ field: 'lifetime_value', op: 'gt', value: 3500 }, { field: 'last_purchase_at', op: 'days_ago_gt', value: 45 }] },
      estimatedSize:  dormantCount,
      estimatedRevenue: 380000,
      createdBy:      'ai_agent',
      aiRationale:    'These customers spent well historically but have gone silent. Win-back window is 90 days — after that reactivation drops to <8%. A personalised 15% offer with urgency (48h expiry) reactivates 22-30%.',
    },
    {
      name:           'At-Risk Churners',
      description:    'Low engagement, 60+ days since last purchase — churn prevention needed',
      nlQuery:        'Customers at risk of churning',
      filterRules:    { operator: 'AND', conditions: [{ field: 'tags', op: 'contains', value: 'at-risk' }, { field: 'last_purchase_at', op: 'days_ago_gt', value: 60 }] },
      estimatedSize:  atRiskCount,
      estimatedRevenue: 95000,
      createdBy:      'ai_agent',
      aiRationale:    'Churn risk > 65%. Aggressive win-back with high-value offer needed. Email + SMS combo performs best here — WhatsApp alone has 40% lower reactivation on this cohort.',
    },
    {
      name:           'WhatsApp Power Users',
      description:    'Customers who prefer WhatsApp and have >70% engagement score',
      nlQuery:        'Customers who engage best on WhatsApp',
      filterRules:    { operator: 'AND', conditions: [{ field: 'preferred_channel', op: 'eq', value: 'whatsapp' }] },
      estimatedSize:  Math.round(inserted.length * 0.25),
      estimatedRevenue: 210000,
      createdBy:      'ai_agent',
      aiRationale:    'WhatsApp delivers 92% open rate for this group vs 45% email. Ideal for flash sale announcements and time-limited offers. Keep messages conversational — long formal messages drop CTR by 35%.',
    },
    {
      name:           'New This Quarter',
      description:    'Customers who made their first purchase in the last 30 days',
      nlQuery:        'New customers acquired this quarter',
      filterRules:    { operator: 'AND', conditions: [{ field: 'total_orders', op: 'eq', value: 1 }, { field: 'last_purchase_at', op: 'days_ago_lt', value: 30 }] },
      estimatedSize:  Math.round(inserted.length * 0.08),
      estimatedRevenue: 55000,
      createdBy:      'marketer',
      aiRationale:    'First-time buyers in onboarding window. Send a welcome journey (Day 3 WhatsApp + Day 7 email) to drive second purchase. Second purchase customers have 3x LTV vs one-time buyers.',
    },
  ]).returning()

  console.log('✅ 5 segments')

  // ── Campaign 1: COMPLETED — Summer Clearance ──────────────────────────────
  const [c1] = await db.insert(schema.campaigns).values({
    name:            'Summer \'25 Clearance — VIP Early Access',
    segmentId:       vipSeg!.id,
    messageTemplate: 'Hi {{name}}, our Summer Clearance is LIVE! 🔥 Up to 40% off premium styles — exclusively for VIP members first. Shop before it opens to everyone: luxefashion.in/vip-sale',
    channel:         'whatsapp',
    sendRatePerMinute: 100,
    status:          'COMPLETED',
    createdBy:       'marketer',
  }).returning()

  await db.insert(schema.campaignStats).values({
    campaignId:       c1!.id,
    sentCount:        vipCount,
    deliveredCount:   Math.round(vipCount * 0.98),
    openedCount:      Math.round(vipCount * 0.92),
    readCount:        Math.round(vipCount * 0.88),
    clickedCount:     Math.round(vipCount * 0.31),
    failedCount:      Math.round(vipCount * 0.02),
    revenueGenerated: '1420000',
  })

  await db.insert(schema.campaignRuns).values({
    campaignId:       c1!.id,
    startedAt:        daysAgo(8),
    completedAt:      daysAgo(7),
    totalQueued:      vipCount,
    totalSent:        Math.round(vipCount * 0.98),
    totalFailed:      Math.round(vipCount * 0.02),
    workerConcurrency: 10,
    durationMs:       vipCount * 600,
    triggeredBy:      'marketer',
  })

  // ── Campaign 2: COMPLETED — Flash Sale SMS ────────────────────────────────
  const [c2] = await db.insert(schema.campaigns).values({
    name:            'Flash Sale — 24h Blitz (SMS)',
    segmentId:       dormantSeg!.id,
    messageTemplate: 'Luxe Fashion: {{name}}, FLASH SALE! 30% off everything. Today only. Use FLASH30 at checkout. Shop: luxefashion.in/flash | Reply STOP to opt out',
    channel:         'sms',
    sendRatePerMinute: 80,
    status:          'COMPLETED',
    createdBy:       'ai_agent',
  }).returning()

  await db.insert(schema.campaignStats).values({
    campaignId:       c2!.id,
    sentCount:        dormantCount,
    deliveredCount:   Math.round(dormantCount * 0.96),
    openedCount:      Math.round(dormantCount * 0.88),
    readCount:        Math.round(dormantCount * 0.82),
    clickedCount:     Math.round(dormantCount * 0.19),
    failedCount:      Math.round(dormantCount * 0.04),
    revenueGenerated: '385000',
  })

  await db.insert(schema.campaignRuns).values({
    campaignId:       c2!.id,
    startedAt:        daysAgo(3),
    completedAt:      daysAgo(3),
    totalQueued:      dormantCount,
    totalSent:        Math.round(dormantCount * 0.96),
    totalFailed:      Math.round(dormantCount * 0.04),
    workerConcurrency: 10,
    durationMs:       dormantCount * 750,
    triggeredBy:      'ai_agent',
  })

  // ── Campaign 3: RUNNING — Win-back at-risk (live now) ────────────────────
  const [c3] = await db.insert(schema.campaigns).values({
    name:            'Win-Back: At-Risk Churners',
    segmentId:       atriskSeg!.id,
    messageTemplate: 'Hi {{name}}, we miss you at Luxe Fashion 💙 Here\'s an exclusive 20% off to welcome you back. Code: COMEBACK20 (expires in 72h). Shop: luxefashion.in',
    channel:         'whatsapp',
    sendRatePerMinute: 60,
    status:          'RUNNING',
    createdBy:       'ai_agent',
  }).returning()

  await db.insert(schema.campaignStats).values({
    campaignId:       c3!.id,
    sentCount:        Math.round(atRiskCount * 0.6),
    deliveredCount:   Math.round(atRiskCount * 0.57),
    openedCount:      Math.round(atRiskCount * 0.48),
    readCount:        Math.round(atRiskCount * 0.40),
    clickedCount:     Math.round(atRiskCount * 0.11),
    failedCount:      Math.round(atRiskCount * 0.03),
    revenueGenerated: '62000',
  })

  await db.insert(schema.campaignRuns).values({
    campaignId:        c3!.id,
    startedAt:         daysAgo(0),
    totalQueued:       atRiskCount,
    totalSent:         Math.round(atRiskCount * 0.6),
    totalFailed:       Math.round(atRiskCount * 0.03),
    workerConcurrency: 10,
    durationMs:        0,
    triggeredBy:       'ai_agent',
  })

  // ── Campaign 4: DRAFT — New customer onboarding ───────────────────────────
  await db.insert(schema.campaigns).values({
    name:            'New Customer Welcome Journey',
    segmentId:       newSeg!.id,
    messageTemplate: 'Welcome to Luxe Fashion, {{name}}! 🎉 Your style journey starts here. Enjoy free shipping on your next order — no minimum. Shop: luxefashion.in/new-arrivals',
    channel:         'email',
    sendRatePerMinute: 100,
    status:          'DRAFT',
    createdBy:       'marketer',
  })

  console.log('✅ 4 campaigns with stats (1 running, 2 completed, 1 draft)')

  // ── Events for campaign 1 (sample delivery history) ───────────────────────
  const sampleCustomers = inserted.slice(0, 40)
  const eventRows: any[] = []
  const commRows:  any[] = []

  for (const cust of sampleCustomers) {
    const commId = crypto.randomUUID()
    const delivered = Math.random() > 0.02
    const opened    = delivered && Math.random() > 0.08
    const clicked   = opened && Math.random() > 0.65

    commRows.push({
      id:             commId,
      campaignId:     c1!.id,
      customerId:     cust.id,
      channel:        'whatsapp',
      message:        `Hi ${cust.name}, our Summer Clearance is LIVE! 🔥 Up to 40% off premium styles.`,
      status:         clicked ? 'clicked' : opened ? 'opened' : delivered ? 'delivered' : 'failed',
      idempotencyKey: `seed-${commId}`,
      deliveredAt:    delivered ? daysAgo(randInt(6, 8)) : null,
      openedAt:       opened ? daysAgo(randInt(6, 7)) : null,
      clickedAt:      clicked ? daysAgo(randInt(5, 6)) : null,
    })

    if (delivered) eventRows.push({ communicationId: commId, campaignId: c1!.id, eventType: 'delivered', correlationId: crypto.randomUUID() })
    if (opened)    eventRows.push({ communicationId: commId, campaignId: c1!.id, eventType: 'opened',    correlationId: crypto.randomUUID() })
    if (clicked)   eventRows.push({ communicationId: commId, campaignId: c1!.id, eventType: 'clicked',   correlationId: crypto.randomUUID() })
  }

  await db.insert(schema.communications).values(commRows)
  await db.insert(schema.events).values(eventRows)
  console.log(`✅ ${commRows.length} sample communications + ${eventRows.length} events`)

  console.log('\n🎉 Seed complete! Summary:')
  console.log(`   500 customers (18% VIP, 37% regular, 20% dormant high-value, 25% at-risk)`)
  console.log(`   ${orderRows.length} orders across all customers`)
  console.log(`   5 segments, 4 campaigns (2 completed w/ stats, 2 drafts)`)
  console.log(`   ${commRows.length} communications + ${eventRows.length} events`)
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
