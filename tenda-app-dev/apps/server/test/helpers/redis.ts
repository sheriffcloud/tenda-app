/**
 * Test-Redis lifecycle. Used by BullMQ worker tests. See README in this folder.
 *
 * Status: types-only scaffold. Concrete impl arrives with `plugins/queue`
 * during Stage 0 work-pass.
 */

import type { TestContext } from 'node:test'

export interface TestRedis {
  /** Connection URL injected into BullMQ-under-test. */
  readonly url: string
}

/** Flushes the test Redis before `fn`; closes the connection after. */
export declare function withTestRedis<T>(
  t: TestContext,
  fn: (redis: TestRedis) => Promise<T>,
): Promise<T>
