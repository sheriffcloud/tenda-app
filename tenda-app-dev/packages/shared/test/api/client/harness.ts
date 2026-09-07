/**
 * Harness for the endpoint-description suites.
 *
 * The factories take their transport as an argument, so these suites inject a
 * RECORDING one rather than mocking a module. That is the practical payoff of
 * #42's seam: no `vi.mock`, no module registry to reason about, and the thing
 * under test is exactly what each client composes.
 *
 * WHAT THIS LAYER OWNS: verb, route constant, and what is passed through.
 * Turning '/v1/gigs/:id' plus `{ id }` into a URL is each client's `request`,
 * and apps/web/api/__tests__/request.test.ts proves it — asserting it again
 * here would test one thing twice and pin nothing new.
 */
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import type { ApiRequest, ApiRequestOptions } from '../../../src/api/client/types'

export type RecordedCall = [string, string, ApiRequestOptions?]

/** Every route constant the client may legitimately reach for. */
const KNOWN_PATHS = new Set(
  Object.values(apiRoutes).flatMap((group) => Object.values(group as Record<string, string>)),
)

export function recordingRequest(): { request: ApiRequest; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const request = (<TResponse,>(
    method: string,
    path: string,
    options?: ApiRequestOptions,
  ): Promise<TResponse> => {
    calls.push(options === undefined ? [method, path] : [method, path, options])
    return Promise.resolve(undefined as TResponse)
  }) as ApiRequest
  return { request, calls }
}

export interface ClientCase {
  /** What the method is for, in the failure message. */
  readonly name: string
  readonly call: () => Promise<unknown>
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly path: string
  /** The options object, omitted when the method passes none. */
  readonly options?: ApiRequestOptions
}

/**
 * Assert one case, plus the invariant every case shares: the path came from
 * `apiRoutes`. A hand-typed string type-checks happily, serves nothing, and
 * only shows up when a client 404s — the same hole the server's
 * `api-routes-drift` suite closes from its side.
 */
export async function expectClientCall(calls: RecordedCall[], testCase: ClientCase): Promise<void> {
  await testCase.call()
  const expected: RecordedCall =
    testCase.options === undefined
      ? [testCase.method, testCase.path]
      : [testCase.method, testCase.path, testCase.options]
  assert.deepEqual(calls.at(-1), expected, testCase.name)
  assert.ok(KNOWN_PATHS.has(testCase.path), `${testCase.name}: path is not in apiRoutes`)
}

/** The last call, compared whole — for the behaviours that are not table-shaped. */
export function assertLastCall(calls: RecordedCall[], ...expected: RecordedCall): void {
  assert.deepEqual(calls.at(-1), expected)
}
