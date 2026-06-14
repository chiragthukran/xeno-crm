// ─── Enums ───────────────────────────────────────────────────────────────────

export type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs'

export type CampaignStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type CommunicationStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'read'
  | 'clicked'

export type EventType =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'read'
  | 'clicked'
  | 'purchase_attributed'

export type CreatedBy = 'ai_agent' | 'marketer'
export type TriggeredBy = 'ai_agent' | 'marketer' | 'scheduler'

export type ChurnRisk = 'Low' | 'Medium' | 'High'

// ─── Segment Filter Rules ─────────────────────────────────────────────────────

export type FilterOperator = 'AND' | 'OR'
export type ConditionOp =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'days_ago_gt' | 'days_ago_lt'
  | 'contains' | 'in'

export interface FilterCondition {
  field: string
  op: ConditionOp
  value: number | string | string[]
}

export interface FilterRules {
  operator: FilterOperator
  conditions: FilterCondition[]
}

// ─── Domain DTOs ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  name: string
  email: string
  phone: string | null
  city: string | null
  tags: string[]
  lifetimeValue: number
  avgOrderValue: number
  totalOrders: number
  lastPurchaseAt: Date | null
  createdAt: Date
}

export interface Order {
  id: string
  customerId: string
  amount: number
  items: OrderItem[]
  status: string
  attributedCampaignId: string | null
  attributionScore: number | null
  createdAt: Date
}

export interface OrderItem {
  name: string
  quantity: number
  price: number
}

export interface Segment {
  id: string
  name: string
  description: string | null
  nlQuery: string | null
  filterRules: FilterRules
  estimatedSize: number | null
  estimatedRevenue: number | null
  createdBy: CreatedBy
  aiRationale: string | null
  createdAt: Date
}

export interface Campaign {
  id: string
  name: string
  segmentId: string
  messageTemplate: string
  channel: Channel
  sendRatePerMinute: number
  scheduledAt: Date | null
  status: CampaignStatus
  createdBy: CreatedBy
  correlationId: string
  createdAt: Date
  updatedAt: Date
}

export interface Communication {
  id: string
  campaignId: string
  customerId: string
  channel: Channel
  message: string
  status: CommunicationStatus
  idempotencyKey: string
  sentAt: Date | null
  deliveredAt: Date | null
  openedAt: Date | null
  clickedAt: Date | null
  correlationId: string
  createdAt: Date
}

export interface CampaignStats {
  campaignId: string
  sentCount: number
  deliveredCount: number
  openedCount: number
  readCount: number
  clickedCount: number
  failedCount: number
  revenueGenerated: number
  updatedAt: Date
}

export interface CustomerInsight {
  customerId: string
  lifetimeValue: number
  avgOrderValue: number
  engagementScore: number
  churnRisk: number
  preferredChannel: Channel | null
  daysSinceLastPurchase: number | null
  lastInteraction: Date | null
  updatedAt: Date
}

// ─── API Request/Response Types ───────────────────────────────────────────────

export interface CreateSegmentBody {
  name: string
  description?: string
  nlQuery?: string
  filterRules: FilterRules
  createdBy?: CreatedBy
  aiRationale?: string
  estimatedSize?: number
  estimatedRevenue?: number
}

export interface CreateCampaignBody {
  name: string
  segmentId: string
  messageTemplate: string
  channel: Channel
  sendRatePerMinute?: number
  scheduledAt?: string
  createdBy?: CreatedBy
}

export interface SegmentPreview {
  count: number
  avgLifetimeValue: number
  topCities: string[]
  avgDaysSincePurchase: number | null
}

export interface PreLaunchValidation {
  pass: boolean
  nextState: CampaignStatus
  reason?: string
  warnings: string[]
  eligibleCount: number
  suppressedCount: number
  cappedCount: number
  overlapPct: number
}

// ─── Queue Job Payloads ───────────────────────────────────────────────────────

export interface SendJobPayload {
  communicationId: string
  campaignId: string
  customerId: string
  channel: Channel
  message: string
  recipientPhone: string | null
  recipientEmail: string
  correlationId: string
}

export interface ReceiptPayload {
  communicationId: string
  campaignId: string
  eventType: EventType
  timestamp: string
  correlationId: string
}

// ─── AI Agent Types ───────────────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CampaignSimulation {
  predictedOpenRate: number
  predictedClickRate: number
  predictedConversionRate: number
  confidenceScore: number
  estimatedRevenue: number
  sendTime: string
  costEstimate: number
}

export interface NextBestAction {
  type: 'campaign' | 'segment' | 'insight'
  title: string
  description: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedRevenue?: number
}
