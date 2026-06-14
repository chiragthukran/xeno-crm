import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createLogger } from '@xeno/logger'
import { simulateDelivery } from './state-machine.js'

const log = createLogger('channel-stub')
const PORT = Number(process.env.CHANNEL_STUB_PORT ?? 3001)
const CRM_RECEIPT_URL = process.env.CRM_RECEIPT_URL ?? 'http://localhost:3000'
const SECRET = process.env.CHANNEL_HMAC_SECRET ?? 'dev-secret'

function signPayload(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function verifySignature(body: string, signature: string): boolean {
  const expected = signPayload(body)
  try { return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex')) }
  catch { return false }
}

async function bootstrap() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: '*' })

  // Rate limiting simulates real channel provider constraints
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Channel rate limit exceeded — slow down your send rate',
    }),
  })

  app.get('/health', async () => ({ status: 'ok', service: 'channel-stub', ts: new Date().toISOString() }))

  // Send endpoint — called by CRM delivery worker
  app.post('/send', async (request, reply) => {
    const rawBody = JSON.stringify(request.body)
    const signature = request.headers['x-signature'] as string

    if (!signature || !verifySignature(rawBody, signature)) {
      log.warn({ ip: request.ip }, 'Invalid HMAC signature — rejecting send request')
      return reply.status(401).send({ error: 'Invalid signature' })
    }

    const { communicationId, campaignId, channel, message, recipient, correlationId } = request.body as any

    log.info({ communicationId, channel, correlationId }, 'Accepted for delivery simulation')

    // Respond immediately — async simulation runs in background (fire and forget)
    reply.status(202).send({ accepted: true, communicationId })

    // Async: run probabilistic state machine and callback CRM
    setImmediate(() => {
      simulateDelivery(communicationId, campaignId, correlationId, CRM_RECEIPT_URL, signPayload)
        .catch(err => log.error({ err, communicationId }, 'State machine error'))
    })
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  log.info({ port: PORT }, 'Channel stub running — simulating WhatsApp/SMS/Email/RCS delivery')
}

bootstrap().catch((err) => { log.error(err); process.exit(1) })
