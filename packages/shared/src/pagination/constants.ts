/**
 * Pagination tuning shared by every paginated surface, so page size and the
 * end-reached trigger are set once rather than re-typed (and drifting) per
 * screen. The server clamps `limit` to MAX_PAGINATION_LIMIT — asking for
 * more than that is silently truncated, so PAGE_SIZE must stay well under it.
 */
import { MAX_PAGINATION_LIMIT } from '../utils/validation'

/** Rows requested per page, before the server cap is applied. */
const DESIRED_PAGE_SIZE = 20

/**
 * Rows per page. Matches the server's own default, so an omitted `limit` and
 * an explicit one behave identically.
 *
 * Clamped to the server's cap rather than merely asserted against it: the
 * server clamps silently, so a value above the cap would make the client
 * believe it asked for more rows than it received — the cursor would advance
 * by the requested size while fewer rows arrived, stranding rows the user can
 * never scroll to. Clamping here keeps both ends agreeing on the window.
 */
export const PAGE_SIZE = Math.min(DESIRED_PAGE_SIZE, MAX_PAGINATION_LIMIT)

/**
 * Conversations per inbox page, and the size of the FIRST one.
 *
 * Larger than `PAGE_SIZE` on purpose: the Messages tab sorts its threads into
 * "Unread" and "Earlier" over whatever is LOADED, so the first page has to be
 * big enough that an unread thread rarely sits beyond it. 50 is also what the
 * list returned before it could page at all, so nothing changes for anyone with
 * fewer. The server uses this as its default `limit` and the client sends it
 * explicitly, which is what lets a full page mean "there may be more".
 *
 * Clamped to the server cap for the reason `PAGE_SIZE` is.
 */
export const INBOX_PAGE_SIZE = Math.min(50, MAX_PAGINATION_LIMIT)

/** FlatList `onEndReachedThreshold` — screens of content before the end. */
export const END_REACHED_THRESHOLD = 0.4
