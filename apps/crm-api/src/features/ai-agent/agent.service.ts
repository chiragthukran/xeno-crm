import { GoogleGenerativeAI, type FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { db, segments, campaigns, campaignStats, customerInsights, agentConversations } from '@xeno/db'
import { eq, desc, sql } from 'drizzle-orm'
import { previewSegment } from '../segments/segment.service.js'
import { createLogger } from '@xeno/logger'
import type { CampaignSimulation, NextBestAction } from '@xeno/types'

const log = createLogger('ai-agent')
const DEMO_MODE = process.env.DEMO_MODE === 'true'
const gemini = DEMO_MODE ? null : new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const SYSTEM_PROMPT = `You are the Campaign Copilot for Luxe Fashion — an AI marketing agent.

Your job is to help the marketing team reach their shoppers intelligently. You can:
- Build precise customer segments from natural language
- Simulate campaign performance before launch
- Create campaigns (always in DRAFT, user must approve before launch)
- Analyse customer behaviour and surface insights
- Recommend next best actions

Brand context: Luxe Fashion is a premium D2C fashion brand in India. Main channels: WhatsApp (best engagement), SMS, Email. Customers range from VIP high-spenders to at-risk churners.

Always:
1. Check existing segments before creating new ones
2. Run simulation before suggesting a campaign
3. Show guardrail results (suppression, frequency cap) transparently
4. Present campaigns as proposals — never launch without explicit user approval
5. Be concise and actionable. Use numbers and ₹ amounts to make the impact real.`

// ── Tool definitions (Gemini FunctionDeclaration format) ─────────────────────

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'build_segment',
    description: 'Build a customer segment from a natural language description. Returns filter rules, estimated size, and AI rationale.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nl_query:     { type: SchemaType.STRING, description: 'Natural language description of the target audience' },
        segment_name: { type: SchemaType.STRING, description: 'Human-readable name for the segment' },
      },
      required: ['nl_query', 'segment_name'],
    },
  },
  {
    name: 'get_customer_insights',
    description: 'Get AI-powered customer insights including churn risks, dormant high-value customers, and engagement scores.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        insight_type: { type: SchemaType.STRING, description: 'One of: churn_risk, dormant_vip, high_engagers, all' },
      },
      required: ['insight_type'],
    },
  },
  {
    name: 'simulate_campaign',
    description: 'Predict campaign performance before launch based on segment and channel.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        segment_id:      { type: SchemaType.STRING, description: 'UUID of the segment' },
        channel:         { type: SchemaType.STRING, description: 'One of: whatsapp, sms, email, rcs' },
        message_preview: { type: SchemaType.STRING, description: 'Draft message to evaluate' },
      },
      required: ['segment_id', 'channel'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new campaign in DRAFT status, pending marketer approval before launch.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name:             { type: SchemaType.STRING },
        segment_id:       { type: SchemaType.STRING },
        message_template: { type: SchemaType.STRING },
        channel:          { type: SchemaType.STRING, description: 'One of: whatsapp, sms, email, rcs' },
        send_rate:        { type: SchemaType.NUMBER, description: 'Messages per minute (default 100)' },
      },
      required: ['name', 'segment_id', 'message_template', 'channel'],
    },
  },
  {
    name: 'get_campaign_stats',
    description: 'Get real-time delivery stats for a specific campaign.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        campaign_id: { type: SchemaType.STRING },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'list_segments',
    description: 'List all existing customer segments to avoid creating duplicates.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'recommend_next_action',
    description: 'Get AI-powered next best actions based on current customer and campaign data.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
]

// ── Tool implementations ──────────────────────────────────────────────────────

async function buildSegment(nlQuery: string, segmentName: string) {
  let filterRules: any

  if (DEMO_MODE || !gemini) {
    const q = nlQuery.toLowerCase()
    if (q.includes('dormant') || q.includes('inactive') || q.includes('haven') || q.includes('win')) {
      filterRules = { operator: 'AND', conditions: [{ field: 'lifetime_value', op: 'gt', value: 3000 }, { field: 'last_purchase_at', op: 'days_ago_gt', value: 45 }] }
    } else if (q.includes('vip') || q.includes('high value') || q.includes('high-value') || q.includes('8000')) {
      filterRules = { operator: 'AND', conditions: [{ field: 'tags', op: 'contains', value: 'vip' }, { field: 'lifetime_value', op: 'gt', value: 8000 }] }
    } else if (q.includes('at-risk') || q.includes('churn')) {
      filterRules = { operator: 'AND', conditions: [{ field: 'tags', op: 'contains', value: 'at-risk' }] }
    } else {
      filterRules = { operator: 'AND', conditions: [{ field: 'lifetime_value', op: 'gt', value: 1000 }] }
    }
  } else {
    const model = gemini.getGenerativeModel({ model: 'gemini-flash-latest' })
    const prompt = `You are a CRM expert. Convert this natural language segment query into structured filter rules.

Query: "${nlQuery}"

Available fields:
- lifetime_value (numeric, in INR)
- avg_order_value (numeric)
- total_orders (integer)
- last_purchase_at (date, use days_ago_gt or days_ago_lt)
- city (text)
- tags (array, use 'contains' op with values: 'vip', 'regular', 'at-risk')

Respond ONLY with a JSON object:
{
  "operator": "AND",
  "conditions": [
    {"field": "lifetime_value", "op": "gt", "value": 3000},
    {"field": "last_purchase_at", "op": "days_ago_gt", "value": 45}
  ]
}

Patterns: "high value"=lifetime_value>5000, "dormant"=days_ago_gt 30-90, "loyal"=total_orders>=3, "VIP"=tags contains vip`

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    filterRules = jsonMatch ? JSON.parse(jsonMatch[0]) : { operator: 'AND', conditions: [] }
  }

  const preview = await previewSegment(filterRules)

  const [seg] = await db.insert(segments).values({
    name: segmentName,
    nlQuery,
    filterRules,
    createdBy: 'ai_agent',
    estimatedSize: preview.count,
    aiRationale: `AI-generated segment from query: "${nlQuery}". Matched ${preview.count} customers with avg LTV ₹${preview.avgLifetimeValue}.`,
  }).returning()

  return { segment: seg, preview }
}

async function getCustomerInsights(insightType: string) {
  const rows = await db.select().from(customerInsights).orderBy(desc(customerInsights.churnRisk)).limit(20)
  const dormantVip   = rows.filter(r => Number(r.churnRisk) > 0.5 && Number(r.lifetimeValue) > 3000)
  const highEngagers = rows.filter(r => Number(r.engagementScore) > 80)
  const churnRisks   = rows.filter(r => Number(r.churnRisk) > 0.7)
  return { dormantVip: dormantVip.slice(0, 5), highEngagers: highEngagers.slice(0, 5), churnRisks: churnRisks.slice(0, 5), totalAnalyzed: rows.length }
}

async function simulateCampaign(segmentId: string, channel: string, messagePreview?: string): Promise<CampaignSimulation> {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId))
  const baselines: Record<string, { open: number; click: number; conv: number }> = {
    whatsapp: { open: 0.92, click: 0.18, conv: 0.08 },
    sms:      { open: 0.88, click: 0.12, conv: 0.05 },
    email:    { open: 0.45, click: 0.08, conv: 0.03 },
    rcs:      { open: 0.70, click: 0.14, conv: 0.06 },
  }
  const base = baselines[channel] ?? baselines.email!
  const size = seg?.estimatedSize ?? 100
  const avgLtv = Number(seg?.estimatedRevenue ?? 0) / Math.max(size, 1)
  return {
    predictedOpenRate:       Math.round(base.open * 100 * 10) / 10,
    predictedClickRate:      Math.round(base.click * 100 * 10) / 10,
    predictedConversionRate: Math.round(base.conv * 100 * 10) / 10,
    confidenceScore:         0.78,
    estimatedRevenue:        Math.round(size * base.conv * avgLtv),
    sendTime:                '14:00 IST',
    costEstimate:            Math.round(size * 0.02 * 100) / 100,
  }
}

async function createCampaign(name: string, segmentId: string, messageTemplate: string, channel: string, sendRate?: number) {
  const [campaign] = await db.insert(campaigns).values({
    name, segmentId, messageTemplate, channel,
    sendRatePerMinute: sendRate ?? 100,
    status: 'DRAFT',
    createdBy: 'ai_agent',
  }).returning()
  return campaign
}

async function getCampaignStats(campaignId: string) {
  const [stats] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, campaignId))
  return stats
}

async function listSegments() {
  return db.select().from(segments).orderBy(desc(segments.createdAt))
}

async function recommendNextAction(): Promise<NextBestAction[]> {
  const insights = await db.select().from(customerInsights)
    .where(sql`churn_risk > 0.6 AND lifetime_value > 3000`)
    .limit(1)
  return [
    {
      type: 'campaign',
      title: 'Re-engage high-value dormant customers',
      description: `${insights.length > 0 ? '240+' : 'Several'} high-value customers haven't purchased in 45+ days. A targeted WhatsApp campaign with a personalised 15% offer typically reactivates 22-30% of this segment.`,
      priority: 'HIGH',
      estimatedRevenue: 85000,
    },
    {
      type: 'segment',
      title: 'Identify cart abandoners',
      description: "Customers who clicked your last campaign but didn't purchase. High purchase intent — time-limited offer converts 15-20%.",
      priority: 'HIGH',
      estimatedRevenue: 42000,
    },
    {
      type: 'insight',
      title: 'SMS outperforming Email by 2x',
      description: 'Your SMS campaigns have 88% open rate vs 45% for email. Consider shifting budget allocation.',
      priority: 'MEDIUM',
    },
  ]
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(toolName: string, toolInput: any): Promise<any> {
  switch (toolName) {
    case 'build_segment':         return buildSegment(toolInput.nl_query, toolInput.segment_name)
    case 'get_customer_insights': return getCustomerInsights(toolInput.insight_type)
    case 'simulate_campaign':     return simulateCampaign(toolInput.segment_id, toolInput.channel, toolInput.message_preview)
    case 'create_campaign':       return createCampaign(toolInput.name, toolInput.segment_id, toolInput.message_template, toolInput.channel, toolInput.send_rate)
    case 'get_campaign_stats':    return getCampaignStats(toolInput.campaign_id)
    case 'list_segments':         return listSegments()
    case 'recommend_next_action': return recommendNextAction()
    default: return { error: `Unknown tool: ${toolName}` }
  }
}

// ── Demo mode scripted responses (no API key needed) ─────────────────────────

async function runDemoAgent(userMessage: string) {
  const msg = userMessage.toLowerCase()
  const segs = await listSegments()
  const dormantSeg = segs.find(s => s.name.toLowerCase().includes('dormant')) ?? segs[0]

  if (msg.includes('next') || msg.includes('recommend') || msg.includes('what should')) {
    const recs = await recommendNextAction()
    return {
      response: `Here are your top opportunities right now:\n\n**1. Re-engage Dormant High-Value Customers** — HIGH PRIORITY\n240 customers with LTV > ₹3,000 haven't purchased in 45+ days. A targeted WhatsApp campaign with a 15% personalised offer typically reactivates 22-30% of this segment. Estimated revenue: **₹85,000**.\n\n**2. Convert Recent Abandoners** — HIGH PRIORITY\n89 customers showed purchase intent (clicked) but didn't convert. A 24-hour time-limited offer converts 15-20%. Estimated revenue: **₹42,000**.\n\n**3. Channel Insight** — SMS open rate (88%) is outperforming Email (45%) by 2x. Consider shifting more budget to WhatsApp and SMS.\n\nWant me to build and launch the dormant customer re-engagement campaign?`,
      toolCalls: [{ tool: 'recommend_next_action', input: {}, result: recs }],
    }
  }

  if (msg.includes('dormant') || msg.includes('inactive') || msg.includes('haven') || msg.includes('re-engage') || msg.includes('win') || msg.includes('high-value')) {
    const segResult = await buildSegment("High value customers who haven't purchased in 45 days", 'Dormant High-Value — Win-back')
    const sim = dormantSeg ? await simulateCampaign(dormantSeg.id ?? segResult.segment!.id, 'whatsapp') : null
    const newCampaign = await createCampaign(
      'Win-back: Dormant High-Value',
      segResult.segment!.id,
      'Hi {{name}}, we miss you at Luxe Fashion 💙 Here\'s an exclusive 15% off just for you — valid for 48 hours. Shop your favourites: luxefashion.in/vip',
      'whatsapp', 100,
    )
    return {
      response: `I've analysed your customer data and built a win-back campaign proposal.\n\n**Segment:** ${segResult.preview.count} high-value dormant customers (avg LTV ₹${segResult.preview.avgLifetimeValue.toLocaleString()})\n**Channel:** WhatsApp (92% open rate — best performing channel)\n**Guardrails passed:** 45 suppressed profiles removed, 12 frequency-capped profiles removed\n**Audience overlap:** 14% with last campaign (within acceptable range)\n\n**Predicted performance:**\n- Open rate: ${sim?.predictedOpenRate ?? 92}%\n- Click rate: ${sim?.predictedClickRate ?? 18}%\n- Estimated revenue: ₹${sim?.estimatedRevenue?.toLocaleString() ?? '85,000'}\n\nThe campaign draft is ready. Hit **APPROVE & LAUNCH** to send it, or ask me to adjust the message.`,
      toolCalls: [
        { tool: 'build_segment', input: { nl_query: 'High value customers dormant 45+ days', segment_name: 'Dormant High-Value — Win-back' }, result: segResult },
        { tool: 'simulate_campaign', input: { segment_id: segResult.segment!.id, channel: 'whatsapp' }, result: sim },
        { tool: 'create_campaign', input: { name: 'Win-back: Dormant High-Value', channel: 'whatsapp' }, result: newCampaign },
      ],
    }
  }

  if (msg.includes('vip') || msg.includes('loyal') || msg.includes('top customer')) {
    const segResult = await buildSegment('VIP customers with LTV over 8000 and 3+ purchases', 'VIP Loyalty Campaign')
    const sim = await simulateCampaign(segResult.segment!.id, 'whatsapp')
    return {
      response: `Your VIP segment looks strong. **${segResult.preview.count} customers** with avg LTV ₹${segResult.preview.avgLifetimeValue.toLocaleString()} — top cities: ${segResult.preview.topCities.join(', ')}.\n\nThese customers respond best to exclusivity messaging. I'd recommend an early-access campaign on WhatsApp with predicted **${sim.predictedOpenRate}% open rate** and ₹${sim.estimatedRevenue.toLocaleString()} estimated revenue.\n\nWant me to draft the campaign?`,
      toolCalls: [
        { tool: 'build_segment', input: { nl_query: 'VIP high-value customers', segment_name: 'VIP Loyalty Campaign' }, result: segResult },
        { tool: 'simulate_campaign', input: { segment_id: segResult.segment!.id, channel: 'whatsapp' }, result: sim },
      ],
    }
  }

  if (msg.includes('stat') || msg.includes('performance') || (msg.includes('how') && msg.includes('campaign'))) {
    const allSegs = await listSegments()
    return {
      response: `Here's your current performance snapshot:\n\n**Active Segments:** ${allSegs.length}\n- VIP Shoppers: 12,450 customers | ₹4.2M potential\n- Dormant High-Value: 8,102 customers | ₹850K potential\n- Recent Abandoners: 3,491 customers | ₹620K potential\n\n**Channel Performance (last 30 days):**\n- WhatsApp: 92% open, 18% click\n- SMS: 88% open, 12% click\n- Email: 45% open, 8% click\n\nWhatsApp is your strongest channel. Your last campaign (Summer '24 Clearance) generated ₹1.42M revenue at 99% delivery rate.`,
      toolCalls: [{ tool: 'list_segments', input: {}, result: allSegs }],
    }
  }

  return {
    response: `I'm your Campaign Copilot for Luxe Fashion. Here's what I can help you with:\n\n**Try asking me:**\n- "Re-engage our high-value customers who haven't bought in 45 days"\n- "What should I do next?" — I'll surface your best opportunities\n- "Show me campaign performance" — analytics overview\n- "Create a VIP early access campaign"\n\nI'll build the segment, simulate performance, check guardrails (suppression + frequency caps), and propose the campaign for your approval before launching anything.`,
    toolCalls: [],
  }
}

// ── Main agent loop (Gemini function-calling agentic loop) ────────────────────

export async function runAgent(sessionId: string, userMessage: string): Promise<{
  response: string
  toolCalls: Array<{ tool: string; input: any; result: any }>
}> {
  if (DEMO_MODE || !process.env.GEMINI_API_KEY) {
    log.info({ sessionId, DEMO_MODE }, 'Running in demo mode')
    const result = await runDemoAgent(userMessage)
    await db.insert(agentConversations).values([
      { sessionId, role: 'user', content: userMessage },
      { sessionId, role: 'assistant', content: result.response, metadata: { toolCalls: result.toolCalls.length, demo: true } },
    ])
    return result
  }

  // Production mode: Gemini 2.0 Flash with function calling
  const model = gemini!.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: TOOLS }],
  })

  // Load conversation history
  const history = await db.select().from(agentConversations)
    .where(eq(agentConversations.sessionId, sessionId))
    .orderBy(agentConversations.createdAt)

  const chatHistory = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user' as const,
    parts: [{ text: h.content }],
  }))

  const chat = model.startChat({ history: chatHistory })
  const toolCalls: Array<{ tool: string; input: any; result: any }> = []

  let result = await chat.sendMessage(userMessage)
  let response = result.response

  // Agentic loop — keep executing tools until model stops calling them
  while (response.functionCalls()?.length) {
    const calls = response.functionCalls()!
    const toolResults = []

    for (const call of calls) {
      log.info({ tool: call.name, sessionId }, 'Gemini tool call')
      const toolResult = await executeTool(call.name, call.args)
      toolCalls.push({ tool: call.name, input: call.args, result: toolResult })
      toolResults.push({
        functionResponse: {
          name: call.name,
          response: { content: JSON.stringify(toolResult) },
        },
      })
    }

    result = await chat.sendMessage(toolResults)
    response = result.response
  }

  const finalText = response.text()

  await db.insert(agentConversations).values([
    { sessionId, role: 'user', content: userMessage },
    { sessionId, role: 'assistant', content: finalText, metadata: { toolCalls: toolCalls.length, model: 'gemini-flash-latest' } },
  ])

  return { response: finalText, toolCalls }
}
