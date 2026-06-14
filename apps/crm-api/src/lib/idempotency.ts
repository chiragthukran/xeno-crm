import { createHash } from 'node:crypto'
import { db, processedEvents } from '@xeno/db'
import { sql } from 'drizzle-orm'

export function makeKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex')
}

export async function checkAndMark(key: string): Promise<boolean> {
  const result = await db
    .insert(processedEvents)
    .values({ idempotencyKey: key })
    .onConflictDoNothing()
    .returning()

  return result.length > 0
}
