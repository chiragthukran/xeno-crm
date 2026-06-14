import {
  pgTable, uuid, text, numeric, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable('customers', {
  id:              uuid('id').primaryKey().defaultRandom(),
  name:            text('name').notNull(),
  email:           text('email').notNull().unique(),
  phone:           text('phone'),
  city:            text('city'),
  tags:            text('tags').array().default(sql`'{}'`),
  lifetimeValue:   numeric('lifetime_value', { precision: 12, scale: 2 }).default('0'),
  avgOrderValue:   numeric('avg_order_value', { precision: 12, scale: 2 }).default('0'),
  totalOrders:     integer('total_orders').default(0),
  lastPurchaseAt:  timestamp('last_purchase_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_customers_last_purchase').on(t.lastPurchaseAt),
  index('idx_customers_lifetime_value').on(t.lifetimeValue),
])

// ─── Orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable('orders', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  customerId:            uuid('customer_id').notNull().references(() => customers.id),
  amount:                numeric('amount', { precision: 12, scale: 2 }).notNull(),
  items:                 jsonb('items').default('[]'),
  status:                text('status').default('completed'),
  attributedCampaignId:  uuid('attributed_campaign_id'),
  attributionWindowHours: integer('attribution_window_hours').default(72),
  attributionScore:      numeric('attribution_score', { precision: 4, scale: 3 }),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_orders_customer').on(t.customerId),
  index('idx_orders_created_at').on(t.createdAt),
])

// ─── Segments ─────────────────────────────────────────────────────────────────

export const segments = pgTable('segments', {
  id:               uuid('id').primaryKey().defaultRandom(),
  name:             text('name').notNull(),
  description:      text('description'),
  nlQuery:          text('nl_query'),
  filterRules:      jsonb('filter_rules').notNull(),
  estimatedSize:    integer('estimated_size'),
  estimatedRevenue: numeric('estimated_revenue', { precision: 14, scale: 2 }),
  createdBy:        text('created_by').notNull().default('marketer'),
  aiRationale:      text('ai_rationale'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaigns = pgTable('campaigns', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  segmentId:          uuid('segment_id').notNull().references(() => segments.id),
  messageTemplate:    text('message_template').notNull(),
  channel:            text('channel').notNull(),
  sendRatePerMinute:  integer('send_rate_per_minute').default(100),
  scheduledAt:        timestamp('scheduled_at', { withTimezone: true }),
  status:             text('status').notNull().default('DRAFT'),
  createdBy:          text('created_by').notNull().default('marketer'),
  correlationId:      uuid('correlation_id').defaultRandom(),
  createdAt:          timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_campaigns_status').on(t.status),
  index('idx_campaigns_segment').on(t.segmentId),
])

// ─── Communications ───────────────────────────────────────────────────────────

export const communications = pgTable('communications', {
  id:               uuid('id').primaryKey().defaultRandom(),
  campaignId:       uuid('campaign_id').notNull().references(() => campaigns.id),
  customerId:       uuid('customer_id').notNull().references(() => customers.id),
  channel:          text('channel').notNull(),
  message:          text('message').notNull(),
  status:           text('status').notNull().default('queued'),
  idempotencyKey:   text('idempotency_key').notNull(),
  sentAt:           timestamp('sent_at', { withTimezone: true }),
  deliveredAt:      timestamp('delivered_at', { withTimezone: true }),
  openedAt:         timestamp('opened_at', { withTimezone: true }),
  clickedAt:        timestamp('clicked_at', { withTimezone: true }),
  correlationId:    uuid('correlation_id').defaultRandom(),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('uniq_communications_idempotency').on(t.idempotencyKey),
  index('idx_communications_campaign').on(t.campaignId),
  index('idx_communications_customer').on(t.customerId),
  index('idx_communications_status').on(t.status),
])

// ─── Events (append-only event log) ──────────────────────────────────────────

export const events = pgTable('events', {
  id:                uuid('id').primaryKey().defaultRandom(),
  communicationId:   uuid('communication_id').references(() => communications.id),
  campaignId:        uuid('campaign_id').notNull().references(() => campaigns.id),
  eventType:         text('event_type').notNull(),
  payload:           jsonb('payload').default('{}'),
  correlationId:     uuid('correlation_id'),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_events_campaign').on(t.campaignId),
  index('idx_events_communication').on(t.communicationId),
  index('idx_events_type').on(t.eventType),
  index('idx_events_created_at').on(t.createdAt),
])

// ─── Idempotency Guard ────────────────────────────────────────────────────────

export const processedEvents = pgTable('processed_events', {
  id:             uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key').notNull(),
  processedAt:    timestamp('processed_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('uniq_processed_events_key').on(t.idempotencyKey),
])

// ─── Campaign Stats (read-optimised materialized counters) ────────────────────

export const campaignStats = pgTable('campaign_stats', {
  campaignId:       uuid('campaign_id').primaryKey().references(() => campaigns.id),
  sentCount:        integer('sent_count').default(0),
  deliveredCount:   integer('delivered_count').default(0),
  openedCount:      integer('opened_count').default(0),
  readCount:        integer('read_count').default(0),
  clickedCount:     integer('clicked_count').default(0),
  failedCount:      integer('failed_count').default(0),
  revenueGenerated: numeric('revenue_generated', { precision: 14, scale: 2 }).default('0'),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── Customer Insights ────────────────────────────────────────────────────────

export const customerInsights = pgTable('customer_insights', {
  customerId:            uuid('customer_id').primaryKey().references(() => customers.id),
  lifetimeValue:         numeric('lifetime_value', { precision: 12, scale: 2 }).default('0'),
  avgOrderValue:         numeric('avg_order_value', { precision: 12, scale: 2 }).default('0'),
  engagementScore:       numeric('engagement_score', { precision: 5, scale: 2 }).default('0'),
  churnRisk:             numeric('churn_risk', { precision: 4, scale: 3 }).default('0'),
  preferredChannel:      text('preferred_channel'),
  daysSinceLastPurchase: integer('days_since_last_purchase'),
  lastInteraction:       timestamp('last_interaction', { withTimezone: true }),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_insights_churn_risk').on(t.churnRisk),
  index('idx_insights_engagement').on(t.engagementScore),
])

// ─── Outbox (prevents dual-write inconsistency) ───────────────────────────────

export const outboxEvents = pgTable('outbox_events', {
  id:            uuid('id').primaryKey().defaultRandom(),
  aggregateId:   uuid('aggregate_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  eventType:     text('event_type').notNull(),
  payload:       jsonb('payload').notNull(),
  publishedAt:   timestamp('published_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_outbox_unpublished').on(t.publishedAt).where(sql`published_at IS NULL`),
])

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export const deadLetterJobs = pgTable('dead_letter_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  jobId:        text('job_id').notNull(),
  queueName:    text('queue_name').notNull(),
  payload:      jsonb('payload').notNull(),
  errorMessage: text('error_message'),
  retryCount:   integer('retry_count').default(0),
  failedAt:     timestamp('failed_at', { withTimezone: true }).defaultNow(),
})

// ─── Suppression List ─────────────────────────────────────────────────────────

export const suppressionList = pgTable('suppression_list', {
  id:            uuid('id').primaryKey().defaultRandom(),
  customerId:    uuid('customer_id').references(() => customers.id),
  email:         text('email'),
  channel:       text('channel'),
  reason:        text('reason').notNull(),
  suppressedAt:  timestamp('suppressed_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_suppression_customer_channel').on(t.customerId, t.channel),
  index('idx_suppression_email').on(t.email),
])

// ─── Frequency Cap Rules ──────────────────────────────────────────────────────

export const frequencyCapRules = pgTable('frequency_cap_rules', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  channel:                text('channel').notNull(),
  maxMessagesPerCustomer: integer('max_messages_per_customer').notNull().default(2),
  windowDays:             integer('window_days').notNull().default(7),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('uniq_freq_cap_channel').on(t.channel),
])

// ─── Campaign Runs (observability) ────────────────────────────────────────────

export const campaignRuns = pgTable('campaign_runs', {
  id:                uuid('id').primaryKey().defaultRandom(),
  campaignId:        uuid('campaign_id').notNull().references(() => campaigns.id),
  startedAt:         timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt:       timestamp('completed_at', { withTimezone: true }),
  totalQueued:       integer('total_queued').default(0),
  totalSent:         integer('total_sent').default(0),
  totalFailed:       integer('total_failed').default(0),
  workerConcurrency: integer('worker_concurrency').default(10),
  durationMs:        integer('duration_ms'),
  triggeredBy:       text('triggered_by').notNull().default('marketer'),
}, (t) => [
  index('idx_campaign_runs_campaign').on(t.campaignId),
])

// ─── AI Conversation History (persistent agent context) ───────────────────────

export const agentConversations = pgTable('agent_conversations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull(),
  role:      text('role').notNull(),
  content:   text('content').notNull(),
  metadata:  jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_agent_conversations_session').on(t.sessionId),
])
