# Xeno AI-Native Mini CRM

**Built by Chirag Yadav** — SDE Take-home Assignment, June 2026

**Live demo → [web-hazel-six-76.vercel.app](https://web-hazel-six-76.vercel.app)**

---

## What is this?

A mini CRM for a fashion brand. Marketers can browse customers, build audience segments, run campaigns across WhatsApp/SMS/Email, and use an AI copilot that plans and drafts campaigns from plain English — no SQL, no data analyst needed.

---

## Assignment Checklist

### Required Features

| Feature | Status | Notes |
|---|---|---|
| Customer list with segments | ✅ Done | 500 seeded customers, filter by VIP / At-Risk / Active |
| Segment builder | ✅ Done | Natural language + filter rules, live audience preview |
| Campaign creation | ✅ Done | Manual form + AI-generated drafts |
| Campaign delivery simulation | ✅ Done | Probabilistic WhatsApp/SMS/Email simulator with real callbacks |
| AI Copilot | ✅ Done | Gemini Flash with 7 tools — builds segment, simulates, drafts campaign |
| Campaign stats | ✅ Done | Sent → Delivered → Opened → Clicked funnel per campaign |
| Analytics dashboard | ✅ Done | KPIs, revenue, delivery rate, channel performance |
| Deployment | ✅ Done | Frontend on Vercel, API + channel-stub on Railway |

### What Was Built Beyond Requirements

| Extra | Why |
|---|---|
| Outbox pattern | Campaign launches never lose jobs even if Redis goes down mid-launch |
| Idempotency keys | BullMQ retries can never send the same message twice |
| Suppression list | Opt-out customers are excluded from every campaign automatically |
| Frequency caps | Customers can't be messaged more than N times in X days |
| Audience overlap check | Warns if >70% of this segment got a campaign recently |
| Dead letter queue | Failed delivery jobs are saved to DB and visible in Admin panel |
| HMAC webhook verification | Channel stub signs every callback — receipt handler verifies with `timingSafeEqual` |
| Live event feed | Campaign detail page polls every 3s, shows delivery events streaming in |
| Correlation IDs | Every request gets an ID that flows through API → queue → channel → receipt → event log |

### What Was Not Built

| Missing | Reason |
|---|---|
| Real WhatsApp / SMS / Email sending | Assignment asks for simulation — channel stub handles this |
| User authentication / login | Out of scope for take-home |
| Campaign scheduling (send at future time) | Not in requirements |
| A/B testing | Not in requirements |
| Mobile app | Not in requirements |

---

## Live URLs

| Service | URL |
|---|---|
| Web App | https://web-hazel-six-76.vercel.app |
| CRM API | https://crm-api-production-9653.up.railway.app |
| Channel Stub | https://channel-stub-production-91d5.up.railway.app |

---

## Tech Stack

| What | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Backend API | Fastify v5, Node.js 20 |
| Database | PostgreSQL (Supabase), Drizzle ORM |
| Job Queue | BullMQ + Upstash Redis |
| AI | Google Gemini Flash (function calling / tool use) |
| Frontend | Next.js 15 App Router |
| Styling | Tailwind CSS, Neobrutalist design |
| Frontend Host | Vercel |
| API Host | Railway |

---

## How the AI Copilot Works

The copilot is a real agentic loop — not a chatbot that just talks.

1. User types a goal: *"Re-engage our dormant high-value customers"*
2. Gemini decides which tools to call
3. It calls **build_segment** → finds 98 matching customers
4. It calls **simulate_campaign** → predicts 18% conversion, ₹2.1L revenue
5. It calls **create_campaign** → writes a DRAFT to the database
6. It returns a Campaign Proposal card with an **Approve & Launch** button
7. Guardrails run automatically: suppressed customers removed, frequency caps checked, overlap flagged

The marketer approves. The AI never launches without human sign-off.

**7 tools available to the AI:**

| Tool | What it does |
|---|---|
| `build_segment` | Natural language → filter rules → audience preview → save |
| `get_customer_insights` | Pulls churn risk, dormant high-value customers, engagement scores |
| `simulate_campaign` | Predicts open rate, click rate, revenue by channel |
| `create_campaign` | Creates a DRAFT — never launches automatically |
| `get_campaign_stats` | Live stats for any existing campaign |
| `list_segments` | Lists all segments to avoid duplicates |
| `recommend_next_action` | Surfaces top 3 opportunities with estimated ₹ impact |

---

## What Makes This Scalable

Most take-home CRMs are basic CRUD apps. This one is built for production problems that show up when you send millions of messages.

### Redis + BullMQ — Async job queue

Campaign delivery is never synchronous. When a marketer hits Launch, the API writes jobs to a **BullMQ queue backed by Upstash Redis**. Workers pick them up with concurrency 10 — meaning 10 messages send in parallel per worker instance. Add more workers to scale horizontally.

```
Launch button → outbox_events table → BullMQ (Redis) → 10 workers → Channel Stub
```

Each job has **3 automatic retries** with exponential backoff (2s → 4s → 8s). After all retries fail, the job moves to a **Dead Letter Queue** table — visible in the Admin panel for manual inspection and re-queue.

---

### Outbox Pattern — zero message loss

The biggest failure risk in async systems: you write to Redis, Redis crashes, the job is gone forever. The **Transactional Outbox** fixes this.

On launch, we write to `outbox_events` (PostgreSQL) **not** directly to BullMQ. A poller runs every second, reads unpublished rows, and flushes them to the queue:

```sql
SELECT * FROM outbox_events
WHERE published_at IS NULL
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED  -- safe for multiple worker instances
```

`FOR UPDATE SKIP LOCKED` means two worker instances can run simultaneously without picking up the same row. If Redis goes down after the row is written but before it's published, the next poll cycle retries it. **No message is ever lost.**

---

### Idempotency — no double sends

BullMQ retries create a new risk: the job succeeds but the network drops before Redis gets the acknowledgement. BullMQ retries it — the customer gets the message twice.

Every send job gets a SHA256 key: `hash(campaign_id + customer_id)`. Before sending, we check:

```typescript
await db.insert(processedEvents)
  .values({ idempotencyKey: key })
  .onConflictDoNothing()  // UNIQUE constraint on key
  .returning()
// empty result = already processed = skip
```

A retry that reaches an already-processed key exits immediately. **Customers can never receive the same campaign message twice.**

---

### Bulkhead Pattern — queues don't interfere

Two completely separate BullMQ queues, each with their own Redis connection and concurrency limit:

| Queue | Concurrency | Purpose |
|---|---|---|
| `campaign-delivery` | 10 | Sending messages to customers |
| `ai-insights` | 2 | Background AI enrichment jobs |

Why separate connections? BullMQ uses blocking Redis commands internally. Sharing one connection between two workers causes them to block each other. Separate connections = separate throughput.

If 50,000 delivery jobs are queued during a big campaign, the AI insight queue still runs at full speed. One cannot starve the other. This is the **Bulkhead pattern** from resilience engineering.

---

### Pre-aggregated Stats — no slow COUNT(*) queries

Every delivery receipt (delivered, opened, clicked) increments a counter in `campaign_stats` atomically:

```sql
UPDATE campaign_stats
SET delivered_count = delivered_count + 1
WHERE campaign_id = $1
```

The dashboard and campaign detail page read directly from this table — no `COUNT(*)`, no `GROUP BY`, no joins. The read query is always `O(1)` regardless of how many events have fired.

---

### Supabase Connection Pooler — handles traffic spikes

PostgreSQL has a hard limit on concurrent connections (~100 by default). Without pooling, a traffic spike from concurrent campaign workers exhausts connections and crashes the DB.

We connect through Supabase's **PgBouncer transaction pooler** (port 6543). Hundreds of worker requests share a small pool of real DB connections. The DB never sees more connections than it can handle.

---

### HMAC Webhook Verification — secure receipts

The channel stub calls back to `/communications/receipt` with delivery events. Anyone who knows the URL could fake events and inflate stats.

The channel stub signs every callback body with HMAC-SHA256 using a shared secret. The receipt endpoint verifies it using `timingSafeEqual` — not `===`. Regular string comparison exits early on the first mismatched byte, leaking timing information that attackers can use to forge signatures. `timingSafeEqual` always takes the same time regardless of where strings differ.

---

### Correlation IDs — trace any message end-to-end

Every HTTP request into the system gets a `x-correlation-id` header. This ID travels through:

```
HTTP request → BullMQ job payload → Channel Stub → /receipt callback → event log
```

Every log line from every service includes it. To trace what happened to one specific message, `grep correlationId=abc123` across all three service logs reconstructs the complete journey.

---

## System Architecture

```
Browser (Next.js on Vercel)
        │
        │ HTTP
        ▼
CRM API (Fastify on Railway)
        │
        ├── PostgreSQL (Supabase) — customers, segments, campaigns, events
        ├── Upstash Redis — BullMQ job queues
        │
        ▼
Campaign Worker (BullMQ, concurrency 10)
        │
        ▼
Channel Stub (Railway) — simulates WhatsApp / SMS / Email
        │
        └── fires /receipt callback → CRM API increments campaign stats
```

**Key patterns used:**

- **Outbox pattern** — launch writes to `outbox_events` table first, a poller flushes to BullMQ. Jobs survive Redis restarts.
- **Idempotency** — every send job has a SHA256 key. Retries hit `ON CONFLICT DO NOTHING` — no double sends.
- **Bulkhead** — delivery queue and AI queue are completely separate with their own Redis connections and concurrency limits. One can't starve the other.
- **State machine** — campaigns move through `DRAFT → QUEUED → RUNNING → COMPLETED`. Invalid transitions are rejected.

---

## Database — 15 Tables

```
customers           — 500 seed records (VIP / Regular / Dormant / At-Risk)
orders              — purchase history
segments            — filter rules (JSONB) + NL query + AI rationale
campaigns           — full lifecycle state machine
communications      — one row per customer per campaign
events              — append-only delivery event log
campaign_stats      — pre-aggregated counters (sent/delivered/opened/clicked/revenue)
campaign_runs       — execution metadata per launch
customer_insights   — churn risk score, engagement score, preferred channel
outbox_events       — async publish buffer
processed_events    — idempotency registry
suppression_list    — opt-outs (NULL channel = global opt-out)
frequency_cap_rules — max messages per customer per time window
dead_letter_jobs    — failed jobs after all retries
agent_conversations — AI copilot chat history
```

---

## Pages

| Page | What it shows |
|---|---|
| `/dashboard` | KPIs, recent campaigns, AI-suggested next actions |
| `/customers` | All 500 customers with LTV, churn risk, last active |
| `/segments` | Segment list + natural language segment builder |
| `/segments/[id]` | Audience size, filter rules, sample customers |
| `/campaigns` | All campaigns with delivery funnel per row |
| `/campaigns/[id]` | Revenue, funnel performance, live event feed |
| `/campaigns/new` | Manual campaign creation form |
| `/copilot` | AI chat with tool call cards and campaign proposal |
| `/admin` | Dead letter queue, frequency caps, suppression list |

---

## Running Locally

**Prerequisites:** Node.js 20+, PostgreSQL, Redis

```bash
git clone https://github.com/chiragthukran/xeno-crm
cd xeno-crm
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and REDIS_URL

# Push schema to database
pnpm db:push

# Seed demo data (500 customers, 4 campaigns, 5 segments)
pnpm db:seed
```

Start services (3 terminals):

```bash
# Terminal 1 — API
cd apps/crm-api && pnpm dev

# Terminal 2 — Channel simulator
cd apps/channel-stub && pnpm dev

# Terminal 3 — Web UI
cd apps/web && pnpm dev
```

Open `http://localhost:3002`

**Try this demo flow:**
1. Go to **Copilot** → type *"Re-engage our dormant high-value customers"*
2. Watch the AI build the segment, run simulation, check guardrails, draft the campaign
3. Click **Approve & Launch**
4. Open the campaign detail page — watch events stream in live

---

Built for Xeno — June 2026
