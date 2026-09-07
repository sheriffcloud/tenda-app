/**
 * lib/slack — the generic Slack delivery module (transport / destinations /
 * format). Purpose-agnostic by design, so this file must stay free of dispute
 * specifics too; the dispute channel's own copy is tested with that feature.
 *
 * The failure this module exists to prevent is SILENT MUTENESS: a typo'd or
 * absent webhook looks identical to a healthy one unless something checks. So
 * the configuration tests carry as much weight here as the transport ones.
 *
 * `fetch` is stubbed per test and restored after — no network, no timers.
 */

import { test, afterEach } from 'node:test'
import * as assert from 'node:assert'
import {
  postToSlackWebhook,
  SLACK_TIMEOUT_MS,
  SLACK_ERROR_DETAIL_MAX,
  SLACK_DESTINATIONS,
  slackEnvKey,
  knownSlackEnvKeys,
  slackDestinationKeys,
  resolveSlackDestination,
  slackConfigProblems,
  escapeSlackText,
  truncate,
  slackLink,
  SLACK_TEXT_MAX,
  type SlackMessage,
} from '@server/lib/slack'
import { AppError } from '@server/lib/errors'
import { restoreFetch, stubFetch, type CapturedRequest } from '../helpers/fetch-stub'

// ---------- fetch stubbing ---------------------------------------------------
// helpers/fetch-stub.ts answers with a REAL Response, so `ok` derives from
// `status` rather than being set beside it, and no cast stands a partial object
// in for the platform type.

afterEach(restoreFetch)

const CFG = { webhook_url: 'https://hooks.slack.com/services/T/B/x' }

/** Body the transport actually sent, parsed back. */
function sentBody(call: CapturedRequest): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

// ---------- transport --------------------------------------------------------

test('postToSlackWebhook: POSTs JSON to the configured webhook', async () => {
  const calls = stubFetch({ status: 200 })
  await postToSlackWebhook(CFG, { text: 'hello' })

  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].url, CFG.webhook_url)
  assert.strictEqual(calls[0].init.method, 'POST')
  assert.deepStrictEqual(calls[0].init.headers, { 'Content-Type': 'application/json' })
  assert.deepStrictEqual(sentBody(calls[0]), { text: 'hello' })
})

// Slack renders blocks but uses `text` for the push/screen-reader fallback, so
// a blocks message that dropped its text would arrive blank in the preview.
test('postToSlackWebhook: sends blocks ALONGSIDE the fallback text', async () => {
  const calls = stubFetch({ status: 200 })
  const msg: SlackMessage = {
    text: 'fallback',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*bold*' } }],
  }
  await postToSlackWebhook(CFG, msg)

  assert.deepStrictEqual(sentBody(calls[0]), {
    text: 'fallback',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*bold*' } }],
  })
})

test('postToSlackWebhook: omits `blocks` entirely when there are none', async () => {
  const calls = stubFetch({ status: 200 })
  await postToSlackWebhook(CFG, { text: 'plain' })
  assert.ok(!('blocks' in sentBody(calls[0])), 'absent, not null or []')
})

test('postToSlackWebhook: applies the abort timeout', async () => {
  const calls = stubFetch({ status: 200 })
  await postToSlackWebhook(CFG, { text: 'x' })
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'a timeout signal is attached')
  assert.strictEqual(SLACK_TIMEOUT_MS, 10_000)
})

test('postToSlackWebhook: throws 502 on a non-2xx and quotes Slack’s reason', async () => {
  stubFetch({ status: 400, body: 'invalid_payload' })
  await assert.rejects(
    () => postToSlackWebhook(CFG, { text: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.strictEqual(err.statusCode, 502)
      // The reason lives in the BODY, not the status line — without it an
      // operator only learns "400".
      assert.match(err.message, /400/)
      assert.match(err.message, /invalid_payload/)
      return true
    },
  )
})

// The endpoint is operator-configured: a misrouted webhook can answer with a
// whole HTML error page, and that would land in the logs verbatim.
test('postToSlackWebhook: bounds the error body it quotes', async () => {
  stubFetch({ status: 502, body: 'E'.repeat(5_000) })
  await assert.rejects(
    () => postToSlackWebhook(CFG, { text: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.ok(
        err.message.length < SLACK_ERROR_DETAIL_MAX + 100,
        `error message not bounded: ${err.message.length} chars`,
      )
      return true
    },
  )
})

test('postToSlackWebhook: an unreadable error body still throws a clean 502', async () => {
  stubFetch({ status: 500, bodyUnreadable: true })
  await assert.rejects(
    () => postToSlackWebhook(CFG, { text: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.strictEqual(err.statusCode, 502)
      assert.match(err.message, /500/)
      return true
    },
  )
})

test('postToSlackWebhook: a whitespace-only body adds no dangling separator', async () => {
  stubFetch({ status: 500, body: '   \n ' })
  await assert.rejects(
    () => postToSlackWebhook(CFG, { text: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.ok(!err.message.endsWith(': '), `dangling separator: ${JSON.stringify(err.message)}`)
      return true
    },
  )
})

test('postToSlackWebhook: never puts the webhook URL in the error (it is a credential)', async () => {
  stubFetch({ status: 403, body: 'no_service' })
  await assert.rejects(
    () => postToSlackWebhook(CFG, { text: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.ok(!err.message.includes(CFG.webhook_url), 'the URL must not leak into logs')
      return true
    },
  )
})

// ---------- destinations -----------------------------------------------------

test('slackEnvKey: derives SLACK_WEBHOOK_<KEY> from the registry key', () => {
  assert.strictEqual(slackEnvKey('disputes'), 'SLACK_WEBHOOK_DISPUTES')
})

// The env name is derived, never stored beside the key — this pins that there
// is no second source of truth to drift.
test('knownSlackEnvKeys: one derived key per destination, no extras', () => {
  const keys = knownSlackEnvKeys()
  assert.strictEqual(keys.size, slackDestinationKeys().length)
  for (const key of slackDestinationKeys()) assert.ok(keys.has(slackEnvKey(key)))
})

// The lower_snake_case rule is a comment in destinations.ts; without this it
// stays a comment. A camelCase key would derive SLACK_WEBHOOK_FIATOPS, which
// is not what whoever added `fiatOps` would put in their .env.
test('every destination key is lower_snake_case, so its env name is predictable', () => {
  for (const key of slackDestinationKeys()) {
    assert.match(key, /^[a-z][a-z0-9_]*$/, `registry key '${key}' breaks the naming rule`)
  }
})

test('every destination declares a non-empty description (it documents the env var)', () => {
  for (const key of slackDestinationKeys()) {
    assert.ok(SLACK_DESTINATIONS[key].description.length > 0, `${key} needs a description`)
  }
})

test('resolveSlackDestination: returns the config when the var is a valid https URL', () => {
  const env = { SLACK_WEBHOOK_DISPUTES: 'https://hooks.slack.com/services/T/B/x' }
  assert.deepStrictEqual(resolveSlackDestination('disputes', env), {
    webhook_url: 'https://hooks.slack.com/services/T/B/x',
  })
})

test('resolveSlackDestination: trims surrounding whitespace (copy-paste from a console)', () => {
  const env = { SLACK_WEBHOOK_DISPUTES: '  https://hooks.slack.com/services/T/B/x \n' }
  assert.deepStrictEqual(resolveSlackDestination('disputes', env), {
    webhook_url: 'https://hooks.slack.com/services/T/B/x',
  })
})

test('resolveSlackDestination: null when unset, blank, or whitespace-only', () => {
  assert.strictEqual(resolveSlackDestination('disputes', {}), null)
  assert.strictEqual(resolveSlackDestination('disputes', { SLACK_WEBHOOK_DISPUTES: '' }), null)
  assert.strictEqual(resolveSlackDestination('disputes', { SLACK_WEBHOOK_DISPUTES: '   ' }), null)
})

test('resolveSlackDestination: null (never a throw) for malformed values', () => {
  for (const bad of [
    'http://hooks.slack.com/x', // not https
    'hooks.slack.com/x', // no scheme
    'javascript:alert(1)', // wrong scheme entirely
    'not a url',
    '//hooks.slack.com/x',
    // Passes the https:// prefix check but is not a parseable URL — the only
    // way to reach the parser's throw, and the reason it is guarded at all.
    'https://',
    'https://[',
  ]) {
    assert.strictEqual(
      resolveSlackDestination('disputes', { SLACK_WEBHOOK_DISPUTES: bad }),
      null,
      `expected null for ${bad}`,
    )
  }
})

// WHATWG parsing accepts `https:host/path` as protocol https + host `host`, so
// a protocol-only check would pass this missing-slashes typo and only fail at
// send time — the silent-mute case.
test('resolveSlackDestination: rejects the missing-slashes typo `https:host/path`', () => {
  assert.strictEqual(
    resolveSlackDestination('disputes', {
      SLACK_WEBHOOK_DISPUTES: 'https:hooks.slack.com/services/T/B/x',
    }),
    null,
  )
})

test('slackConfigProblems: healthy when every destination is unset or valid', () => {
  assert.deepStrictEqual(slackConfigProblems({}), [])
  assert.deepStrictEqual(
    slackConfigProblems({ SLACK_WEBHOOK_DISPUTES: 'https://hooks.slack.com/services/T/B/x' }),
    [],
  )
})

// The whole point of the second tier: set-but-broken must NOT look like absent.
test('slackConfigProblems: names the exact env key of a set-but-malformed value', () => {
  const problems = slackConfigProblems({ SLACK_WEBHOOK_DISPUTES: 'http://insecure' })
  assert.strictEqual(problems.length, 1)
  assert.match(problems[0], /SLACK_WEBHOOK_DISPUTES/)
})

test('slackConfigProblems: a blank var is "not configured", not a problem', () => {
  assert.deepStrictEqual(slackConfigProblems({ SLACK_WEBHOOK_DISPUTES: '  ' }), [])
})

// ---------- format -----------------------------------------------------------

test('escapeSlackText: escapes the three mrkdwn control characters', () => {
  assert.strictEqual(escapeSlackText('a < b > c & d'), 'a &lt; b &gt; c &amp; d')
})

// The classic ordering bug: escaping `<` first, then `&`, double-escapes the
// ampersand this function just introduced and renders a literal `&lt;`.
test('escapeSlackText: escapes & FIRST so entities are not double-escaped', () => {
  assert.strictEqual(escapeSlackText('<'), '&lt;')
  assert.strictEqual(escapeSlackText('&lt;'), '&amp;lt;')
  assert.ok(!escapeSlackText('<a>').includes('&amp;'), 'no double escaping')
})

test('escapeSlackText: leaves ordinary text and mrkdwn emphasis untouched', () => {
  assert.strictEqual(escapeSlackText('*bold* _italic_ 100%'), '*bold* _italic_ 100%')
  assert.strictEqual(escapeSlackText(''), '')
})

test('truncate: text at or under the cap is returned untouched', () => {
  assert.strictEqual(truncate('abc', 3), 'abc')
  assert.strictEqual(truncate('abc', 10), 'abc')
})

test('truncate: the ellipsis counts INSIDE the budget', () => {
  const out = truncate('abcdef', 4)
  assert.strictEqual(out, 'abc…')
  assert.strictEqual(out.length, 4, 'never longer than the caller asked for')
})

test('truncate: degenerate budgets (0, negative, shorter than the ellipsis)', () => {
  assert.strictEqual(truncate('abcdef', 0), '')
  assert.strictEqual(truncate('abcdef', -5), '')
  assert.strictEqual(truncate('abcdef', 1), '…')
})

// `String.prototype.slice` cuts a surrogate pair in half and the lone
// surrogate renders as U+FFFD. User-authored text has emoji in it routinely.
test('truncate: never splits a surrogate pair at the cut point', () => {
  // 5 code points (a, b, emoji, c, d) but 6 UTF-16 units — a unit-based slice
  // at 3 would cut the emoji in half and leave a lone surrogate.
  const out = truncate('ab😀cd', 4)
  assert.strictEqual(out, 'ab😀…')
  assert.ok(out.isWellFormed(), 'no lone surrogate survives truncation')
  assert.ok(!'ab😀cd'.slice(0, 3).isWellFormed(), 'a naive unit slice would have been ill-formed')
})

test('truncate: defaults to the Slack section cap', () => {
  assert.strictEqual(SLACK_TEXT_MAX, 3_000)
  assert.strictEqual([...truncate('x'.repeat(5_000))].length, SLACK_TEXT_MAX)
})

test('slackLink: builds <url|label> and escapes the label', () => {
  assert.strictEqual(slackLink('https://e.com/d/1', 'Open'), '<https://e.com/d/1|Open>')
})

// An unescaped `>` in the label would terminate the link early and spill the
// rest of the message out of it.
test('slackLink: a label containing markup cannot break out of the link', () => {
  const out = slackLink('https://e.com', 'a > b & c')
  assert.strictEqual(out, '<https://e.com|a &gt; b &amp; c>')
  assert.strictEqual(out.indexOf('>'), out.length - 1, 'only the closing bracket is a raw >')
})
