import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  customers, orders, segments, campaigns, communications,
  events, processedEvents, campaignStats, customerInsights,
  outboxEvents, deadLetterJobs, suppressionList, frequencyCapRules,
  campaignRuns, agentConversations,
} from './schema.js'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL!

// Transaction pooler (Supabase/pgbouncer) requires prepare:false and explicit search_path
const isPooler = connectionString.includes('.pooler.supabase.com')
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: !isPooler,
  ...(isPooler ? { connection: { search_path: 'public' } } : {}),
})

export const db = drizzle(client, { schema })

export {
  customers, orders, segments, campaigns, communications,
  events, processedEvents, campaignStats, customerInsights,
  outboxEvents, deadLetterJobs, suppressionList, frequencyCapRules,
  campaignRuns, agentConversations,
  schema,
}
