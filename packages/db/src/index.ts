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
  max: 5,         // keep headroom: worker(concurrency 10) + API share this pool via PgBouncer
  idle_timeout: 20,
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
