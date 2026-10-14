/**
 * Per-route rate limits shared by more than one route.
 *
 * The global default (plugins/rate-limit.ts) is 100 a minute per IP. A list
 * read costs a database page of up to MAX_PAGINATION_LIMIT rows, so the public
 * order book states its own ceiling instead of inheriting the one meant for a
 * health check: 60 a minute is 6,000 rows a minute per IP rather than 10,000,
 * and a signed-out reader who pages the book by hand never gets near it.
 *
 * Per IP on purpose. The book is ANONYMOUS (#179), so there is no account to
 * key on, and an account-keyed bucket would only hand a scraper one fresh
 * allowance per free wallet (see docs/unattended-run-findings-2026-10-04.md, G3).
 */
export const PUBLIC_FEED_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const

/**
 * POST /v1/agent/tasks, in two layers that both apply to a request.
 *
 * The ACCOUNT layer (preHandler, after authenticate) is the allowance one agent
 * gets wherever it calls from; a gig is two requests (the 402, then the signed
 * resend), so 10 a minute is about 5 gigs a minute per account. The IP layer
 * (config.rateLimit, before authentication) is the OUTER bound: accounts are
 * free to mint (POST /v1/agent/register), so without it every fresh wallet
 * would carry its own allowance. It is three accounts' worth, so a few agents
 * behind one office, proxy or serverless egress no longer share ten requests.
 */
export const AGENT_TASK_ACCOUNT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const
export const AGENT_TASK_IP_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const

/**
 * POST /v1/agent/tasks/validate: one account read and a pure check, no model
 * call and no chain call, so it is allowed more than the one-shot it fronts —
 * a bulk importer checks a batch of rows before any wallet signature. Same two
 * layers as the one-shot, for the same reason.
 */
export const AGENT_VALIDATE_ACCOUNT_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const
export const AGENT_VALIDATE_IP_RATE_LIMIT = { max: 120, timeWindow: '1 minute' } as const
