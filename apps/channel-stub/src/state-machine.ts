import type { EventType } from '@xeno/types'

// Probabilistic state machine — calibrated transition probabilities
const TRANSITIONS: Array<{ event: EventType; probability: number; delayMs: [number, number] }> = [
  { event: 'delivered',          probability: 0.92, delayMs: [500,  2000]  },
  { event: 'opened',             probability: 0.45, delayMs: [2000, 8000]  },
  { event: 'read',               probability: 0.70, delayMs: [1000, 4000]  },
  { event: 'clicked',            probability: 0.30, delayMs: [3000, 10000] },
  { event: 'purchase_attributed',probability: 0.08, delayMs: [5000, 20000] },
]

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)) }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

export async function simulateDelivery(
  communicationId: string,
  campaignId: string,
  correlationId: string,
  crmReceiptUrl: string,
  signature: (body: string) => string,
) {
  let currentState: EventType = 'sent'

  for (const transition of TRANSITIONS) {
    if (Math.random() > transition.probability) break

    const delay = rand(...transition.delayMs)
    await sleep(delay)

    currentState = transition.event

    const payload = {
      communicationId,
      campaignId,
      eventType: transition.event,
      timestamp: new Date().toISOString(),
      correlationId,
    }

    const body = JSON.stringify(payload)

    try {
      await fetch(`${crmReceiptUrl}/receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature(body),
          'x-correlation-id': correlationId,
        },
        body,
      })
    } catch (err) {
      // Fire-and-forget: log but don't block the chain
      console.error(`[channel-stub] receipt callback failed: ${transition.event}`, err)
    }

    // failed = terminal state, stop chain
    if (transition.event === 'failed') break
  }
}
