/**
 * Where the queues live — Redis connection parameters and queue naming.
 *
 * Separate from ./options because these answer a different question. This file
 * is about REACHING Redis and addressing a queue inside it; ./options is about
 * how a job behaves once it is there. The split also follows what varies per
 * deployment: the connection comes from `REDIS_URL` and differs by environment,
 * while everything in ./options is the same everywhere.
 */

import type { JobName } from './payloads'

/** Queue name prefix so several apps can share one Redis safely.
 *  NB: BullMQ forbids ':' in queue names (its own key separator). */
export const QUEUE_PREFIX = 'tenda'

export function queueName(name: JobName): string {
  return `${QUEUE_PREFIX}.${name}`
}

export interface QueueConnectionOptions {
  host: string
  port: number
  password?: string
  db?: number
  /** BullMQ requirement for blocking commands. */
  maxRetriesPerRequest: null
}

/** Parse REDIS_URL into BullMQ connection options (each Queue/Worker owns
 *  its client, no shared-instance type coupling to a specific ioredis). */
export function queueConnectionOptions(redis_url: string): QueueConnectionOptions {
  const u = new URL(redis_url)
  return {
    host: u.hostname,
    port: u.port === '' ? 6379 : Number(u.port),
    ...(u.password !== '' ? { password: u.password } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    maxRetriesPerRequest: null,
  }
}
