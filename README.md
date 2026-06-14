# Xeno CRM — AI-Native Campaign Platform

> Take-home assignment for Xeno SDE role — built by Chirag Yadav

A production-grade, AI-native Mini CRM for reaching shoppers at scale. Built as a Turborepo monorepo with three independent services, a full PostgreSQL schema, and a Claude-powered campaign copilot that can build segments, simulate performance, enforce guardrails, and propose campaigns — all without leaving the chat.

**Live demo:** `http://localhost:3002` (local) · Deployable to Vercel + Railway

---

## What Was Built

### Three services, one monorepo

| Service | Port | Stack |
|---|---|---|
| `apps/crm-api` | 3000 | Fastify v5, Drizzle ORM, BullMQ, PostgreSQL |
| `apps/channel-stub` | 3001 | Fastify v5, probabilistic delivery simulator |
| `apps/web` | 3002 | Next.js 15 App Router, Tailwind, Neobrutalist UI |

### Three shared packages

| Package | Purpose |
|---|---|
| `packages/db` | Drizzle schema (15 tables), migrations, seed |
| `packages/types` | Shared TypeScript DTOs across all services |
| `packages/logger` | pino JSON logger factory with correlation ID support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                         │
│   Copilot · Dashboard · Customers · Segments · Campaigns · Admin │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                    CRM API  (Fastify, :3000)                      │
│                                                                   │
│  Route handlers → Outbox → BullMQ ──► Campaign Worker (×10)     │
│                                  └──► AI Worker (×2)             │
│                                                                   │
│  Receipt endpoint  ◄────────────────────────────────────────────┤
└───────────────────────────┬──────────────────────┬──────────────┘
                            │ PostgreSQL            │ Redis (BullMQ)
                            ▼                       ▼
                     ┌─────────────┐       ┌───────────────┐
                     │  15 tables  │       │  2 queues     │
                     │  Drizzle ORM│       │  delivery     │
                     │  + indexes  │       │  ai-insights  │
                     └─────────────┘       └───────────────┘
                                                    │
                                         ┌──────────▼──────────┐
                                         │  Channel Stub :3001  │
                                         │  Probabilistic FSM   │
                                         │  P(delivered)=0.92   │
                                         │  Fires /receipt CBs  │
                                         └─────────────────────┘
```

---

## Key Engineering Decisions

### 1. Outbox Pattern — prevents dual-write

Campaign launch never writes directly to BullMQ. Instead it writes to `outbox_events`, and a poller flushes to the queue:

```sql
SELECT * FROM outbox_events
WHERE published_at IS NULL
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED   -- race-condition-safe with multiple workers
```

The `try/catch` intentionally leaves rows `PENDING` on BullMQ failure — the next poll cycle retries automatically. No message is lost even if Redis goes down during a launch.

### 2. Bulkhead Pattern — delivery never starves AI

Two completely separate BullMQ queues with dedicated Redis connections and concurrency limits:

```typescript
// Delivery queue — latency-sensitive, high throughput
export const deliveryQueue = new Queue('campaign-delivery', {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
})
const campaignWorker = new Worker('campaign-delivery', processor, { concurrency: 10 })

// AI queue — Claude API rate-limited, separate pool
export const aiQueue = new Queue('ai-insights', {
  defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
})
const aiWorker = new Worker('ai-insights', aiProcessor, { concurrency: 2 })
```

A surge of 10,000 delivery jobs cannot starve AI insight generation, and vice versa. Each worker also gets its own `IORedis` instance — sharing connections with BullMQ causes blocking command deadlocks.

### 3. Idempotency — exactly-once delivery

Every send job gets a SHA256 key derived from `campaign_id + customer_id`:

```typescript
export function makeKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex')
}

export async function checkAndMark(key: string): Promise<boolean> {
  const result = await db.insert(processedEvents)
    .values({ idempotencyKey: key })
    .onConflictDoNothing()
    .returning()
  return result.length > 0  // false = already processed, skip
}
```

The `processed_events` table has a `UNIQUE` constraint on `idempotency_key`. BullMQ retries after network failures will hit `onConflictDoNothing` and return early — no double-sends.

### 4. HMAC-SHA256 receipt verification — timing-safe

The channel stub signs every callback with a shared secret. The receipt endpoint verifies with `timingSafeEqual` to prevent timing attacks:

```typescript
export function verifySignature(body: string, signature: string): boolean {
  const expected = signPayload(body)
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch { return false }
}
```

Using `===` for HMAC comparison is a security bug — early exit on first mismatched byte leaks timing information. `timingSafeEqual` always takes the same time regardless of where the strings diverge.

### 5. Campaign State Machine — strict transitions

No campaign can jump to an invalid state. Every transition is checked against an explicit allowlist:

```typescript
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
```

`FAILED → DRAFT` allows marketers to fix and relaunch. `COMPLETED` and `CANCELLED` are terminal. Any attempt to skip states (e.g., `DRAFT → RUNNING`) throws immediately.

### 6. Pre-Launch Guardrail Pipeline

Every launch runs through a sequential validation pipeline before a single job hits the queue:

```
1. Resolve all customers in segment
   └─ if count < 10 → FAIL (segment_too_small), return to DRAFT

2. Remove suppressed customers
   └─ channel-specific OR globally suppressed (channel IS NULL)

3. Remove frequency-capped customers
   └─ counts ALL messages in the window, not just this campaign
   └─ if eligible = 0 → FAIL (all_customers_excluded), CANCEL campaign

4. Check audience overlap with recent campaigns
   └─ if overlap > 70% → WARN (high_overlap), proceed anyway

5. PASS → transition QUEUED → RUNNING → fan-out to BullMQ
```

The frequency cap query is correct by design — it counts *all* communications to a customer in the window across *all* campaigns, not just the one being launched. Filtering by campaign_id would let marketers spam customers through multiple simultaneous campaigns.

### 7. Suppression List — handles global + channel suppression

```typescript
.where(and(
  inArray(suppressionList.customerId, customerIds),
  sql`(${suppressionList.channel} = ${channel} OR ${suppressionList.channel} IS NULL)`
))
```

`channel IS NULL` means globally suppressed — the customer opted out of all communications. Indexed on `(customer_id, channel)` for pre-launch query performance on large segments.

### 8. Separate Read and Write Paths

Write path: every delivery receipt increments `campaign_stats` counters atomically.
Read path: the dashboard, campaign detail page, and analytics all read from `campaign_stats` — a materialized, pre-aggregated view that never requires `COUNT(*)` at query time.

```typescript
// Write: receipt handler increments the right counter
await db.update(campaignStats)
  .set({ deliveredCount: sql`delivered_count + 1`, updatedAt: new Date() })
  .where(eq(campaignStats.campaignId, campaignId))

// Read: instant, no joins, no aggregation
const [stats] = await db.select().from(campaignStats)
  .where(eq(campaignStats.campaignId, id))
```

This is not CQRS (no event sourcing, no projection rebuilding). It is a counter-cache / materialized read model — a simpler pattern that fits the problem.

### 9. Append-Only Event Log

Every delivery event is written to an `events` table that is never updated or deleted. This gives a complete, auditable trail of what happened to every message sent:

```
sent → delivered → opened → read → clicked → purchase_attributed
```

The events table is the source of truth for auditing. `campaign_stats` is derived from it (via receipt callbacks) and can be rebuilt from it if counters drift.

### 10. Correlation IDs — end-to-end traceability

Every request that enters the system gets a `x-correlation-id` header assigned at the API gateway hook:

```typescript
app.addHook('onRequest', async (request) => {
  request.correlationId = request.headers['x-correlation-id'] ?? randomUUID()
})
```

This ID flows through: `CRM API → BullMQ job payload → Channel Stub → /receipt callback → event log`. Every pino log line includes it. A single `grep correlationId=abc123` across all three service logs reconstructs the complete journey of one message.

### 11. Dead Letter Queue — failed jobs are visible

Jobs that exhaust all retry attempts (3 attempts, exponential backoff: 2s → 4s → 8s) are captured in a `dead_letter_jobs` table rather than silently disappearing:

```typescript
campaignWorker.on('failed', async (job, err) => {
  await db.insert(deadLetterJobs).values({
    jobId: job.id,
    queueName: 'campaign-delivery',
    payload: job.data,
    errorMessage: err.message,
    retryCount: job.attemptsMade,
  })
})
```

The Admin screen shows the full DLQ with payload inspection, so operations teams can diagnose failures and manually re-queue.

### 12. Probabilistic Channel Simulator

The channel stub simulates realistic delivery behaviour using a Markov chain with calibrated probabilities:

```typescript
const TRANSITIONS = [
  { event: 'delivered',           probability: 0.92, delayMs: [500,   2000]  },
  { event: 'opened',              probability: 0.45, delayMs: [2000,  8000]  },
  { event: 'read',                probability: 0.70, delayMs: [1000,  4000]  },
  { event: 'clicked',             probability: 0.30, delayMs: [3000,  10000] },
  { event: 'purchase_attributed', probability: 0.08, delayMs: [5000,  20000] },
]
```

Each transition is independent (Bernoulli trial). The chain breaks at the first failed transition — a message that isn't delivered can't be opened. Callbacks fire asynchronously with realistic timing jitter, so the live event feed on the campaign detail page shows a believable stream.

---

## AI Copilot

The copilot uses Claude Sonnet 4.6 in a real agentic loop with tool use. It is not a chatbot that echoes prompts — it reasons, picks tools, inspects results, and chains calls:

### 7 Tools

| Tool | What it does |
|---|---|
| `build_segment` | Converts natural language to structured filter rules, runs preview, persists segment |
| `get_customer_insights` | Pulls churn risk, dormant VIPs, engagement scores from DB |
| `simulate_campaign` | Predicts open/click/conversion rates and estimated revenue by channel |
| `create_campaign` | Creates a DRAFT campaign — never launches without user approval |
| `get_campaign_stats` | Live stats for any campaign |
| `list_segments` | All existing segments (avoids creating duplicates) |
| `recommend_next_action` | Surfaces top 3 prioritised opportunities with ₹ impact |

### Agentic Loop

```
User message
    │
    ▼
Claude decides: use tool or respond?
    │
    ├─► tool_use → execute → append tool_result → re-invoke Claude
    │                                                      │
    │                         ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
    │
    └─► stop_reason: end_turn → return final text + tool call trace
```

Claude can chain multiple tools in one turn: check segments → build new one → simulate → draft campaign → all before the first response appears. The UI shows each tool call as an expandable card with the exact input/output.

### Demo Mode

`DEMO_MODE=true` bypasses the Anthropic API entirely. Scripted responses cover the main marketing intents (dormant re-engagement, VIP campaigns, next actions, performance stats) and still call real DB tools — the segment is actually built, the simulation runs against real data, the campaign is actually drafted. The demo is functional, not mocked.

---

## Database Schema — 15 Tables

```
customers           — 500 seed records, 3 personas (VIP / Occasional / At-Risk)
orders              — purchase history with 72h attribution window
segments            — filter rules as JSONB + NL query + AI rationale
campaigns           — state machine lifecycle + channel + send rate
communications      — one row per customer per campaign, idempotency key (UNIQUE)
events              — append-only delivery event log
campaign_stats      — materialized counters (sent/delivered/opened/read/clicked/revenue)
campaign_runs       — execution metadata per launch (concurrency, duration, trigger)
customer_insights   — churn risk (0–1), engagement score, preferred channel
outbox_events       — async publish buffer (partial index WHERE published_at IS NULL)
processed_events    — idempotency registry (UNIQUE on key)
suppression_list    — opt-outs by customer+channel, NULL channel = global
frequency_cap_rules — max messages per customer per window, per channel
dead_letter_jobs    — failed BullMQ jobs after all retries
agent_conversations — persistent copilot chat history by session
```

---

## Frontend — 8 Pages

| Page | What it shows |
|---|---|
| `/dashboard` | KPI cards, segment health, recent campaign performance |
| `/copilot` | AI chat with tool call cards, guardrail panel, campaign proposal |
| `/customers` | 500 customers with churn risk badges and LTV |
| `/segments` | Natural language segment builder with live preview |
| `/campaigns` | ALL CAMPAIGNS list with inline delivery funnel per row |
| `/campaigns/[id]` | Revenue hero card + live event feed (polls every 3s) |
| `/campaigns/new` | Manual campaign creation form |
| `/analytics` | Recharts bar chart + channel performance matrix |
| `/admin` | DLQ viewer + frequency cap rules + suppression list |

Design system: Neobrutalist — hard black box shadows (`4px 4px 0px #000`), lime accent (`#ccff00`), Montserrat headlines, Hanken Grotesk body. No rounded corners, no gradients.

---

## Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 15 running locally
- Redis running locally (`brew install redis && brew services start redis`)

### Setup

```bash
git clone https://github.com/chiragthukran/xeno-crm
cd xeno-crm

# Install all dependencies
node $(which pnpm || echo ~/.cache/node/corepack/v1/pnpm/*/dist/pnpm.mjs) install

# Create database
createdb xeno_crm

# Copy env and configure
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL
# For local: DATABASE_URL=postgresql://$(whoami)@localhost:5432/xeno_crm

# Apply schema (interactive confirmation required)
cd packages/db && pnpm exec drizzle-kit push

# Seed 500 customers + 3 segments + 2 campaigns
DATABASE_URL=postgresql://$(whoami)@localhost:5432/xeno_crm pnpm exec tsx src/seed.ts
```

### Start all three services

```bash
# Terminal 1 — CRM API
cd apps/crm-api
DATABASE_URL=... REDIS_URL=redis://localhost:6379 DEMO_MODE=true \
CHANNEL_HMAC_SECRET=xeno-demo-hmac-secret-2026 CHANNEL_STUB_URL=http://localhost:3001 \
CRM_RECEIPT_URL=http://localhost:3000 CRM_API_PORT=3000 \
pnpm exec tsx src/index.ts

# Terminal 2 — Channel Stub
cd apps/channel-stub
CHANNEL_HMAC_SECRET=xeno-demo-hmac-secret-2026 CRM_RECEIPT_URL=http://localhost:3000 \
CHANNEL_STUB_PORT=3001 pnpm exec tsx src/index.ts

# Terminal 3 — Web UI
cd apps/web
NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm exec next dev -p 3002
```

Open `http://localhost:3002` — the copilot works immediately with `DEMO_MODE=true`, no API keys needed.

### Demo flow

1. **Copilot** → type *"re-engage our high-value customers who haven't purchased in 45 days"*
2. Watch AI build the segment, simulate performance, check guardrails, draft campaign
3. Hit **APPROVE & LAUNCH** on the proposal card
4. Open the **campaign detail page** — watch the live event feed as delivery/opened/clicked events stream in
5. Check **Analytics** for channel performance breakdown

---

## What Makes This Different

Most take-home CRM projects are CRUD apps with a chatbot. This is a system that solves real production problems:

**Race conditions**: `SELECT FOR UPDATE SKIP LOCKED` in the outbox means multiple workers can't double-publish the same event. Adding a second CRM API instance for scale doesn't break anything.

**Exactly-once delivery**: SHA256 idempotency keys + `ON CONFLICT DO NOTHING` means BullMQ retries after network failures never send the same message twice.

**Security**: `timingSafeEqual` for HMAC verification — a naive `===` comparison is a timing oracle that leaks whether the signature is wrong at the first byte or the last. This is an OWASP A02 vulnerability that most implementations get wrong.

**Backpressure**: Two separate queues with separate concurrency limits and separate Redis connections. A send-rate spike on delivery doesn't starve the AI worker pool. This is the bulkhead pattern from resilience engineering.

**Observable**: Every message gets a correlation ID that flows from HTTP request through BullMQ payload through channel stub through receipt callback through the event log. `grep correlationId=xyz` reconstructs the full journey.

**Honest AI design**: The copilot never launches campaigns. It creates DRAFT proposals and requires explicit marketer approval. The guardrail panel is visible before launch — suppressed count, frequency-capped count, overlap percentage. The AI is a collaborator, not an autopilot.

---

## Project Structure

```
xeno-crm/
├── apps/
│   ├── crm-api/
│   │   └── src/
│   │       ├── features/
│   │       │   ├── ai-agent/       ← Claude tool loop + demo mode
│   │       │   ├── campaigns/      ← state machine + pre-launch guardrails
│   │       │   ├── communications/ ← receipt handler + event log writer
│   │       │   ├── customers/      ← search + churn risk
│   │       │   ├── segments/       ← NL → filter rules + freq cap + suppression
│   │       │   ├── analytics/      ← channel performance aggregation
│   │       │   └── admin/          ← DLQ viewer + cap management
│   │       ├── lib/
│   │       │   ├── hmac.ts         ← sign + timingSafeEqual verify
│   │       │   ├── idempotency.ts  ← SHA256 key + checkAndMark
│   │       │   └── correlation-id.ts
│   │       ├── queues/index.ts     ← two BullMQ queues, separate Redis connections
│   │       └── workers/
│   │           ├── campaign.worker.ts  ← concurrency 10, DLQ on failure
│   │           └── outbox.worker.ts    ← FOR UPDATE SKIP LOCKED poller
│   ├── channel-stub/
│   │   └── src/
│   │       ├── index.ts            ← /send endpoint with HMAC verify
│   │       └── state-machine.ts    ← probabilistic delivery FSM
│   └── web/
│       └── src/
│           ├── app/                ← 8 Next.js pages
│           ├── components/layout/  ← Neobrutalist sidebar
│           └── lib/api.ts          ← typed API client
├── packages/
│   ├── db/src/
│   │   ├── schema.ts               ← 15 Drizzle tables + indexes
│   │   ├── index.ts                ← db client export
│   │   └── seed.ts                 ← 500 customers, 3 personas
│   ├── logger/src/index.ts         ← pino factory + correlationId child
│   └── types/src/index.ts          ← shared DTOs + enums
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Parallel task execution, shared package deduplication |
| API | Fastify v5 | 3× faster than Express, schema-first, typed plugins |
| ORM | Drizzle | SQL-first, zero magic, migrations as code |
| Queue | BullMQ | Redis-backed, exactly-once semantics, DLQ built-in |
| AI | Claude Sonnet 4.6 | Tool use API, best instruction-following for structured output |
| Frontend | Next.js 15 App Router | RSC for initial load, client components for real-time polling |
| Styling | Tailwind + Neobrutalist tokens | Hard shadows, lime accent — matches design brief |
| Charts | Recharts | Composable, no opinion on data format |
| Logger | pino | JSON structured, minimal overhead, child loggers for correlation |

---

Built for Xeno's SDE take-home — June 2026
