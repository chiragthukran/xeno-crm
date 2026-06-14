import { randomUUID } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'

export const correlationIdHook = async (request: FastifyRequest, _reply: FastifyReply) => {
  const existing = request.headers['x-correlation-id']
  ;(request as any).correlationId = (typeof existing === 'string' ? existing : null) ?? randomUUID()
}

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string
  }
}
