import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { runAgent } from './agent.service.js'

const ChatSchema = z.object({
  message:   z.string().min(1).max(2000),
  sessionId: z.string().default(() => `session-${Date.now()}`),
})

export async function agentRoutes(app: FastifyInstance) {
  app.post('/ai/chat', async (request, reply) => {
    const { message, sessionId } = ChatSchema.parse(request.body)
    const result = await runAgent(sessionId, message)
    return reply.send(result)
  })
}
