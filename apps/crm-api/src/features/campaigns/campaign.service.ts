import { db, campaigns, campaignStats, outboxEvents, segments } from '@xeno/db'
import { eq } from 'drizzle-orm'
import { assertTransition } from './campaign.state-machine.js'
import { resolveSegmentCustomers, getSuppressedIds, getFrequencyCappedIds, checkSegmentOverlap } from '../segments/segment.service.js'
import type { CampaignStatus, PreLaunchValidation, FilterRules } from '@xeno/types'
import { createLogger } from '@xeno/logger'

const log = createLogger('campaign-service')

export async function transitionCampaign(campaignId: string, to: CampaignStatus) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  assertTransition(campaign.status as CampaignStatus, to)

  await db.update(campaigns)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId))

  log.info({ campaignId, from: campaign.status, to }, 'Campaign state transition')
  return { ...campaign, status: to }
}

export async function validatePreLaunch(campaignId: string): Promise<PreLaunchValidation> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const [segment] = await db.select().from(segments).where(eq(segments.id, campaign.segmentId))
  if (!segment) throw new Error(`Segment ${campaign.segmentId} not found`)

  // 1. Resolve all customers in segment
  const allCustomers = await resolveSegmentCustomers(segment.filterRules as FilterRules, campaign.channel)
  const customerIds = allCustomers.map(c => c.id)
  const warnings: string[] = []

  if (customerIds.length < 10) {
    return { pass: false, nextState: 'DRAFT', reason: 'segment_too_small', warnings, eligibleCount: customerIds.length, suppressedCount: 0, cappedCount: 0, overlapPct: 0 }
  }

  // 2. Remove suppressed customers
  const suppressed = await getSuppressedIds(customerIds, campaign.channel)
  let eligible = customerIds.filter(id => !suppressed.includes(id))

  // 3. Remove frequency-capped customers
  const capped = await getFrequencyCappedIds(eligible, campaign.channel)
  eligible = eligible.filter(id => !capped.includes(id))

  // 4. Hard fail if no eligible customers remain
  if (eligible.length === 0) {
    return { pass: false, nextState: 'CANCELLED', reason: 'all_customers_excluded', warnings, eligibleCount: 0, suppressedCount: suppressed.length, cappedCount: capped.length, overlapPct: 0 }
  }

  // 5. Overlap check — soft warning
  const overlapPct = await checkSegmentOverlap(campaign.segmentId)
  if (overlapPct > 70) warnings.push('high_overlap')
  if (eligible.length < 50) warnings.push('small_segment')

  return {
    pass: true,
    nextState: 'QUEUED',
    warnings,
    eligibleCount: eligible.length,
    suppressedCount: suppressed.length,
    cappedCount: capped.length,
    overlapPct,
  }
}

export async function enqueueCampaign(campaignId: string, triggeredBy = 'marketer') {
  await db.insert(outboxEvents).values({
    aggregateId: campaignId,
    aggregateType: 'campaign',
    eventType: 'campaign.launch',
    payload: { campaignId, triggeredBy },
  })

  log.info({ campaignId, triggeredBy }, 'Campaign enqueued via outbox')
}

export async function initCampaignStats(campaignId: string) {
  await db.insert(campaignStats)
    .values({ campaignId })
    .onConflictDoNothing()
}
