import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { createLogger } from '@xeno/logger'
import { correlationIdHook } from './lib/correlation-id.js'
import { customerRoutes } from './features/customers/customer.routes.js'
import { segmentRoutes } from './features/segments/segment.routes.js'
import { campaignRoutes } from './features/campaigns/campaign.routes.js'
import { communicationRoutes } from './features/communications/communication.routes.js'
import { analyticsRoutes } from './features/analytics/analytics.routes.js'
import { agentRoutes } from './features/ai-agent/agent.routes.js'
import { adminRoutes } from './features/admin/admin.routes.js'
import { campaignWorker } from './workers/campaign.worker.js'
import { startOutboxWorker } from './workers/outbox.worker.js'

const log = createLogger('crm-api')
const PORT = Number(process.env.CRM_API_PORT ?? 3000)

async function bootstrap() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: '*' })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  app.addHook('onRequest', correlationIdHook)

  app.addHook('onRequest', async (request) => {
    log.info({ method: request.method, url: request.url, correlationId: (request as any).correlationId }, 'Incoming request')
  })

  await app.register(customerRoutes)
  await app.register(segmentRoutes)
  await app.register(campaignRoutes)
  await app.register(communicationRoutes)
  await app.register(analyticsRoutes)
  await app.register(agentRoutes)
  await app.register(adminRoutes)

  app.get('/health', async () => ({ status: 'ok', service: 'crm-api', ts: new Date().toISOString() }))

  // Start background workers
  startOutboxWorker()
  log.info({ concurrency: 10, queueName: 'campaign-delivery', workerActive: campaignWorker.isRunning() }, 'Delivery worker active (bulkhead: separate from AI queue)')

  await app.listen({ port: PORT, host: '0.0.0.0' })
  log.info({ port: PORT }, 'CRM API running')
}

bootstrap().catch((err) => { log.error(err); process.exit(1) })
