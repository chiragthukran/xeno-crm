import type { CampaignStatus } from '@xeno/types'

// Strict transition table — no skipping states
const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT:      ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['APPROVED', 'FAILED'],
  APPROVED:   ['SCHEDULED', 'QUEUED', 'CANCELLED'],
  SCHEDULED:  ['QUEUED', 'CANCELLED'],
  QUEUED:     ['RUNNING', 'CANCELLED'],
  RUNNING:    ['PAUSED', 'COMPLETED', 'FAILED'],
  PAUSED:     ['RUNNING', 'CANCELLED'],
  COMPLETED:  [],
  FAILED:     ['DRAFT'],
  CANCELLED:  [],
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid campaign state transition: ${from} → ${to}`)
  }
}
