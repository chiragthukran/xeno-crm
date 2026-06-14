import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.CHANNEL_HMAC_SECRET ?? 'dev-secret'

export function signPayload(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

export function verifySignature(body: string, signature: string): boolean {
  const expected = signPayload(body)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
