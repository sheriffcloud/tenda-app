/**
 * Shared display constants for GigCardCompact variants.
 * Status mappings live in @/lib/gig-display, see STATUS_LABEL / statusDotColor.
 * Money formatting lives in ./amount, see gigCardAmountDigits.
 */
export { STATUS_LABEL } from '@tenda/shared'
export { statusDotColor as STATUS_DOT_COLOR } from '@/lib/gig-display'
export { categoryDotColor as CATEGORY_DOT_COLOR } from '@/lib/gig-display'

/*
 * NO SUCCESS CHIP — why no card renders `gigDeadlineMeta`'s success tone (or
 * the Check glyph it pairs with). The rationale all three variants point at,
 * so a decision that governs three files is written once.
 *
 * The helper returns that tone only for completed/resolved, and builds the
 * chip's label from `updated_at` — a field `GigSummary` does not carry — so
 * the chip is empty and hidden either way. Carrying `updated_at` on the
 * summary would turn it on, at the cost of a new field on the ANONYMOUS feed
 * and fixture churn in three apps, to add a relative timestamp beside a status
 * the card already prints (`showStatus`). Not worth it; the exact moment is on
 * the detail screen. If that trade ever changes, the shared arm is still there
 * — turning it back on is the wire field plus a tone branch in each variant.
 *
 * A plain block comment, below the exports and attached to nothing: a `/** *\/`
 * block here becomes the JSDoc of the NEXT declaration (verified by emitting a
 * .d.ts), so the note would surface when hovering `STATUS_LABEL`. Prose, not an
 * export, for the same reason — an export nobody imports is the dead code this
 * file would otherwise be teaching. What holds the premise is
 * `display-branches.test.tsx`: "a CLOSED gig shows no deadline chip at all"
 * fails the moment the summary gains the field.
 */
