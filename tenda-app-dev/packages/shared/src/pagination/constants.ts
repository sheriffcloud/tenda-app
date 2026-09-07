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

/** FlatList `onEndReachedThreshold` — screens of content before the end. */
export const END_REACHED_THRESHOLD = 0.4
