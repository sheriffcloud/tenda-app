/**
 * Profile-field limits, enforced server-side on PATCH /v1/users/me and
 * PATCH /v1/users/:id (`optionalName`, lib/validation).
 *
 * Here rather than as a literal in each route because a form that does not
 * know the bound lets someone type past it and finish the sentence before the
 * server answers 422 — and the onboarding step, where a name is the ONLY thing
 * being asked for, is the worst place to learn a limit after pressing the
 * button. Clients cap the input with this; the server still checks it, because
 * a client bound is a courtesy and never a guarantee.
 *
 * Measured BEFORE the trim, matching `optionalString` — see its note on why the
 * check sits where it does.
 */
export const NAME_MAX_LENGTH = 100

/**
 * The label every surface pins on an agent poster (`UserRef.is_agent`, #19).
 * Shared so the app, the web and any future surface say it the same way: a
 * human deciding whether to take an escrow is told, in the same words
 * everywhere, that the other side is software.
 */
export const AGENT_BADGE_LABEL = 'AI agent'
