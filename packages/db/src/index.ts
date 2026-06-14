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

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })

export {
  customers, orders, segments, campaigns, communications,
  events, processedEvents, campaignStats, customerInsights,
  outboxEvents, deadLetterJobs, suppressionList, frequencyCapRules,
  campaignRuns, agentConversations,
  schema,
}
