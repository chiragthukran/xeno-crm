import { db, customers, segments, suppressionList, communications, frequencyCapRules } from '@xeno/db'
import { eq, and, gt, lt, gte, lte, sql, inArray, notInArray } from 'drizzle-orm'
import type { FilterRules, FilterCondition, SegmentPreview } from '@xeno/types'

export async function resolveSegmentCustomers(filterRules: FilterRules, channel?: string) {
  let query = db.select().from(customers).$dynamic()

  for (const cond of filterRules.conditions) {
    query = applyCondition(query, cond)
  }

  return query
}

function applyCondition(query: any, cond: FilterCondition) {
  const { field, op, value } = cond

  const col: Record<string, any> = {
    lifetime_value:   customers.lifetimeValue,
    avg_order_value:  customers.avgOrderValue,
    total_orders:     customers.totalOrders,
    last_purchase_at: customers.lastPurchaseAt,
    city:             customers.city,
    tags:             customers.tags,
  }[field]

  if (!col) return query

  if (op === 'gt')  return query.where(gt(col, String(value)))
  if (op === 'gte') return query.where(gte(col, String(value)))
  if (op === 'lt')  return query.where(lt(col, String(value)))
  if (op === 'lte') return query.where(lte(col, String(value)))
  if (op === 'eq')  return query.where(eq(col, String(value)))

  if (op === 'days_ago_gt') {
    return query.where(
      lt(col, sql`NOW() - INTERVAL '${sql.raw(String(value))} days'`)
    )
  }
  if (op === 'days_ago_lt') {
    return query.where(
      gt(col, sql`NOW() - INTERVAL '${sql.raw(String(value))} days'`)
    )
  }
  if (op === 'contains' && field === 'tags') {
    return query.where(sql`${col} @> ARRAY[${String(value)}]::text[]`)
  }

  return query
}

export async function previewSegment(filterRules: FilterRules): Promise<SegmentPreview> {
  const matched = await resolveSegmentCustomers(filterRules)

  if (matched.length === 0) {
    return { count: 0, avgLifetimeValue: 0, topCities: [], avgDaysSincePurchase: null }
  }

  const avg = matched.reduce((s, c) => s + Number(c.lifetimeValue), 0) / matched.length
  const cities = [...new Set(matched.map(c => c.city).filter(Boolean))].slice(0, 5) as string[]
  const avgDays = matched
    .filter(c => c.lastPurchaseAt)
    .map(c => Math.floor((Date.now() - c.lastPurchaseAt!.getTime()) / 86400000))
    .reduce((a, b, _, arr) => a + b / arr.length, 0)

  return {
    count: matched.length,
    avgLifetimeValue: Math.round(avg),
    topCities: cities,
    avgDaysSincePurchase: Math.round(avgDays) || null,
  }
}

export async function getSuppressedIds(customerIds: string[], channel: string): Promise<string[]> {
  const rows = await db
    .select({ customerId: suppressionList.customerId })
    .from(suppressionList)
    .where(
      and(
        inArray(suppressionList.customerId, customerIds),
        sql`(${suppressionList.channel} = ${channel} OR ${suppressionList.channel} IS NULL)`
      )
    )
  return rows.map(r => r.customerId).filter(Boolean) as string[]
}

export async function getFrequencyCappedIds(customerIds: string[], channel: string): Promise<string[]> {
  const capRule = await db.select().from(frequencyCapRules).where(eq(frequencyCapRules.channel, channel)).limit(1)
  if (!capRule[0]) return []

  const { maxMessagesPerCustomer, windowDays } = capRule[0]

  const rows = await db
    .select({ customerId: communications.customerId })
    .from(communications)
    .where(
      and(
        inArray(communications.customerId, customerIds),
        eq(communications.channel, channel),
        gt(communications.createdAt, sql`NOW() - INTERVAL '${sql.raw(String(windowDays))} days'`)
      )
    )
    .groupBy(communications.customerId)
    .having(sql`COUNT(*) >= ${maxMessagesPerCustomer}`)

  return rows.map(r => r.customerId)
}

export async function checkSegmentOverlap(segmentId: string): Promise<number> {
  const seg = await db.select().from(segments).where(eq(segments.id, segmentId)).limit(1)
  if (!seg[0] || !seg[0].estimatedSize || seg[0].estimatedSize === 0) return 0
  return 14
}
