import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const client = postgres(process.env.DATABASE_URL!, { max: 1 })
const db = drizzle(client, { schema })

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat']
const CHANNELS = ['whatsapp', 'email', 'sms', 'rcs'] as const
const FIRST_NAMES = ['Priya', 'Rahul', 'Sneha', 'Arjun', 'Divya', 'Kiran', 'Neha', 'Vikram', 'Pooja', 'Amit', 'Riya', 'Sanjay', 'Meera', 'Rohit', 'Ananya', 'Deepak', 'Kavya', 'Suresh', 'Shruti', 'Manish', 'Eleanor', 'Marcus', 'Sarah', 'James', 'Aisha']
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Joshi', 'Verma', 'Mishra', 'Agarwal', 'Vance', 'Thorne', 'Jenkins', 'Cole', 'Malik']

function rand(min: number, max: number) { return Math.random() * (max - min) + min }
function randInt(min: number, max: number) { return Math.floor(rand(min, max)) }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]! }
function daysAgo(days: number) { return new Date(Date.now() - days * 86400000) }

async function seed() {
  console.log('🌱 Seeding Luxe Fashion database...')

  // ── Frequency cap defaults ────────────────────────────────────────────────
  await db.insert(schema.frequencyCapRules).values([
    { channel: 'email', maxMessagesPerCustomer: 3, windowDays: 7 },
    { channel: 'sms', maxMessagesPerCustomer: 2, windowDays: 7 },
    { channel: 'whatsapp', maxMessagesPerCustomer: 2, windowDays: 7 },
    { channel: 'rcs', maxMessagesPerCustomer: 3, windowDays: 7 },
  ]).onConflictDoNothing()

  // ── Suppression list samples ──────────────────────────────────────────────
  await db.insert(schema.suppressionList).values([
    { email: 'user@bounced-domain.com', channel: null, reason: 'hard_bounce' },
    { email: 'spam.trap@isp.net', channel: null, reason: 'spam_complaint' },
    { email: 'complaint@angry-user.com', channel: 'email', reason: 'manual_block' },
  ]).onConflictDoNothing()

  // ── Generate customers ────────────────────────────────────────────────────
  const customerRows = []
  for (let i = 0; i < 500; i++) {
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const name = `${firstName} ${lastName}`
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`

    // Persona distribution: 20% VIP, 50% occasional, 30% at-risk/churned
    let ltv: number, orders: number, daysSincePurchase: number, churnRisk: number, engagementScore: number
    const persona = Math.random()

    if (persona < 0.2) {
      // VIP Shoppers
      ltv = rand(8000, 25000)
      orders = randInt(8, 30)
      daysSincePurchase = randInt(1, 20)
      churnRisk = rand(0.0, 0.2)
      engagementScore = rand(75, 100)
    } else if (persona < 0.7) {
      // Occasional buyers
      ltv = rand(1500, 8000)
      orders = randInt(2, 8)
      daysSincePurchase = randInt(10, 60)
      churnRisk = rand(0.2, 0.5)
      engagementScore = rand(40, 75)
    } else {
      // At-risk / churned
      ltv = rand(500, 3000)
      orders = randInt(1, 4)
      daysSincePurchase = randInt(45, 180)
      churnRisk = rand(0.6, 1.0)
      engagementScore = rand(5, 40)
    }

    const avgOrder = ltv / orders
    const lastPurchase = daysAgo(daysSincePurchase)
    const preferredChannel = pick(CHANNELS)

    customerRows.push({
      name,
      email,
      phone: `+91${randInt(7000000000, 9999999999)}`,
      city: pick(CITIES),
      tags: persona < 0.2 ? ['vip', 'loyal'] : persona < 0.7 ? ['regular'] : ['at-risk'],
      lifetimeValue: ltv.toFixed(2),
      avgOrderValue: avgOrder.toFixed(2),
      totalOrders: orders,
      lastPurchaseAt: lastPurchase,
      _churnRisk: churnRisk,
      _engagementScore: engagementScore,
      _preferredChannel: preferredChannel,
      _daysSincePurchase: daysSincePurchase,
    })
  }

  const inserted = await db.insert(schema.customers)
    .values(customerRows.map(({ _churnRisk, _engagementScore, _preferredChannel, _daysSincePurchase, ...c }) => c))
    .returning()

  console.log(`✅ Inserted ${inserted.length} customers`)

  // ── Customer insights ─────────────────────────────────────────────────────
  const insightRows = inserted.map((c, i) => {
    const meta = customerRows[i]!
    return {
      customerId: c.id,
      lifetimeValue: c.lifetimeValue,
      avgOrderValue: c.avgOrderValue,
      engagementScore: meta._engagementScore.toFixed(2),
      churnRisk: meta._churnRisk.toFixed(3),
      preferredChannel: meta._preferredChannel,
      daysSinceLastPurchase: meta._daysSincePurchase,
      lastInteraction: daysAgo(randInt(0, meta._daysSincePurchase)),
    }
  })
  await db.insert(schema.customerInsights).values(insightRows).onConflictDoNothing()
  console.log('✅ Inserted customer insights')

  // ── Pre-built segments ────────────────────────────────────────────────────
  const [vipSeg, dormantSeg, abandonerSeg] = await db.insert(schema.segments).values([
    {
      name: 'VIP Shoppers',
      description: 'High-value customers with LTV > ₹8000 and 3+ purchases in last 90 days',
      nlQuery: 'High value customers who bought multiple times recently',
      filterRules: {
        operator: 'AND',
        conditions: [
          { field: 'lifetime_value', op: 'gt', value: 8000 },
          { field: 'total_orders', op: 'gte', value: 3 },
          { field: 'last_purchase_at', op: 'days_ago_lt', value: 90 },
        ],
      },
      estimatedSize: inserted.filter((_, i) => Number(customerRows[i]!.lifetimeValue) > 8000).length,
      estimatedRevenue: 420000,
      createdBy: 'ai_agent',
      aiRationale: 'These customers are your most engaged and highest-spending segment. They respond well to exclusive early access and loyalty rewards. Estimated 3.2x ROAS on campaigns targeting this group.',
    },
    {
      name: 'Dormant High-Value',
      description: 'LTV > ₹3000 but no purchases in the last 45 days',
      nlQuery: 'High value customers who haven\'t bought recently',
      filterRules: {
        operator: 'AND',
        conditions: [
          { field: 'lifetime_value', op: 'gt', value: 3000 },
          { field: 'last_purchase_at', op: 'days_ago_gt', value: 45 },
        ],
      },
      estimatedSize: 120,
      estimatedRevenue: 85000,
      createdBy: 'ai_agent',
      aiRationale: 'These customers have historically spent well but have gone quiet. A win-back campaign with a personalised incentive typically reactivates 22-30% of this segment. High urgency — the longer they go without engagement, the harder they are to reactivate.',
    },
    {
      name: 'Recent Abandoners',
      description: 'Customers who clicked a campaign but did not purchase within 72 hours',
      nlQuery: 'Customers who clicked but never converted',
      filterRules: {
        operator: 'AND',
        conditions: [
          { field: 'tags', op: 'contains', value: 'at-risk' },
          { field: 'last_purchase_at', op: 'days_ago_gt', value: 7 },
        ],
      },
      estimatedSize: 89,
      estimatedRevenue: 62000,
      createdBy: 'ai_agent',
      aiRationale: 'Showed purchase intent but did not convert. A time-limited offer (24h expiry) with social proof elements typically converts 15-20% of this group.',
    },
  ]).returning()

  console.log('✅ Inserted segments')

  // ── Sample completed campaign ─────────────────────────────────────────────
  const [campaign] = await db.insert(schema.campaigns).values({
    name: 'Summer \'24 Clearance',
    segmentId: vipSeg!.id,
    messageTemplate: 'Hi {{name}}, our Summer Clearance is LIVE! 🔥 Get up to 40% off on premium styles — exclusively for our VIP members. Shop now before it ends.',
    channel: 'whatsapp',
    sendRatePerMinute: 100,
    status: 'COMPLETED',
    createdBy: 'marketer',
  }).returning()

  // ── Campaign stats for the completed campaign ─────────────────────────────
  await db.insert(schema.campaignStats).values({
    campaignId: campaign!.id,
    sentCount: 125000,
    deliveredCount: 124102,
    openedCount: 82450,
    readCount: 74000,
    clickedCount: 24310,
    failedCount: 898,
    revenueGenerated: '1420000',
  }).onConflictDoNothing()

  await db.insert(schema.campaignRuns).values({
    campaignId: campaign!.id,
    startedAt: daysAgo(5),
    completedAt: daysAgo(4),
    totalQueued: 125000,
    totalSent: 124102,
    totalFailed: 898,
    workerConcurrency: 10,
    durationMs: 7200000,
    triggeredBy: 'marketer',
  })

  // Second campaign
  const [campaign2] = await db.insert(schema.campaigns).values({
    name: 'Flash Sale VIPs',
    segmentId: dormantSeg!.id,
    messageTemplate: 'Hey {{name}}! We miss you 💙 Here\'s 15% off just for you — valid for the next 48 hours only. Tap to shop your favourites.',
    channel: 'sms',
    sendRatePerMinute: 50,
    status: 'RUNNING',
    createdBy: 'ai_agent',
  }).returning()

  await db.insert(schema.campaignStats).values({
    campaignId: campaign2!.id,
    sentCount: 8400,
    deliveredCount: 8300,
    openedCount: 7800,
    readCount: 7500,
    clickedCount: 1080,
    failedCount: 100,
    revenueGenerated: '42000',
  }).onConflictDoNothing()

  console.log('✅ Inserted campaigns and stats')
  console.log('🎉 Seed complete!')
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
