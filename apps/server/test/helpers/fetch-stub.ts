/**
 * Recording `fetch` double, for the outbound HTTP this server does.
 *
 * Two suites had grown their own copy — lib/slack's transport tests and the
 * Slack alert channel's — and the second was written by copying the first, so
 * they also shared its one flaw.
 *
 * That flaw: both returned an object LITERAL asserted `as Response`. Two
 * problems with it. `ok` and `status` were independently settable, so a fixture
 * could describe `{ ok: true, status: 500 }` — a response that cannot exist,
 * and a test written against it proves nothing about real behaviour. And the
 * assertion is a claim the compiler cannot check: a partial stand-in passes
 * until the code under test reaches for a field nobody stubbed, which surfaces
 * as `undefined is not a function` somewhere unrelated.
 *
 * This returns a REAL `Response`. `ok` derives from `status` the way the
 * platform derives it, every other member genuinely exists, and no cast is
 * needed anywhere.
 */

/** Captured once at module load, before any test can replace it. */
const realFetch = globalThis.fetch

export interface CapturedRequest {
  url: string
  init: RequestInit
}

export interface StubResponse {
  /** `ok` is DERIVED from this, never set beside it. */
  status: number
  body?: string
  /**
   * Make reading the body fail — a connection dropped mid-response, which is
   * how the transport's error path can be reached without a readable reason.
   */
  bodyUnreadable?: boolean
}

/** A body whose stream is already errored, so `.text()` rejects. */
function unreadableBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(new Error('stream closed'))
    },
  })
}

/**
 * Replace `fetch` with one that records every call and answers with `res`.
 * Returns the array it records into — it fills as calls arrive.
 *
 * Callers must `restoreFetch()` afterwards, normally in an `afterEach`.
 */
export function stubFetch(res: StubResponse = { status: 200 }): CapturedRequest[] {
  const calls: CapturedRequest[] = []
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(res.bodyUnreadable === true ? unreadableBody() : (res.body ?? ''), {
      status: res.status,
    })
  }
  return calls
}

/**
 * Replace `fetch` with one that REJECTS — a DNS failure, a refused connection,
 * an abort. Distinct from a non-2xx: the transport's contract says those two
 * surface differently, so a caller that only handles one is only half guarded.
 */
export function stubFetchRejecting(error: Error): void {
  globalThis.fetch = async () => {
    throw error
  }
}

export function restoreFetch(): void {
  globalThis.fetch = realFetch
}

// ---------- Expo push -------------------------------------------------------

/** What the Expo transport was asked to deliver, across every batch. */
export interface ExpoPushCapture {
  /** Every token, in order. `tokens.length` is "how many pushes went out". */
  tokens: string[]
}

/**
 * Stub the Expo push endpoint and record the tokens it is asked to deliver to.
 *
 * Four suites had hand-rolled this: three counting sends (the retry-idempotency
 * tests) and one reporting DeviceNotRegistered for a dead token. All four built
 * the ticket array by hand and returned an object literal `as Response`, which
 * is the exact cast this module's header explains away — so the copies had also
 * inherited the flaw the shared helper exists to remove.
 *
 * `statusFor` covers both uses: default every token to 'ok' to just count, or
 * return 'DeviceNotRegistered' for a token to exercise the pruning path. Expo
 * correlates tickets to tokens BY INDEX, which is why the response is built by
 * mapping the request's own `to` array rather than from a fixture.
 */
export function stubExpoPush(
  statusFor: (token: string) => 'ok' | 'DeviceNotRegistered' = () => 'ok',
): ExpoPushCapture {
  const capture: ExpoPushCapture = { tokens: [] }
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const { to } = JSON.parse(String(init?.body)) as { to: string[] }
    capture.tokens.push(...to)
    const data = to.map((token) => {
      const status = statusFor(token)
      return status === 'ok'
        ? { status: 'ok' }
        : { status: 'error', details: { error: status } }
    })
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return capture
}
