/**
 * The public gig feed's explicit orderings (GET /v1/gigs `sort`). A runtime
 * list, not only a type, so the Agent API document can publish the vocabulary
 * without restating it. Relevance is deliberately absent: it is the implicit
 * ordering of a search and means nothing without a `q` to rank against.
 */
export const GIG_LIST_SORTS = ['created_at', 'amount_asc', 'amount_desc'] as const

export type GigListSort = (typeof GIG_LIST_SORTS)[number]
