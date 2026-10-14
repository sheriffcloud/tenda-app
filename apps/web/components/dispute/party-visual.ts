/**
 * The web PRESENTATION of a party accent — Tailwind classes per accent token,
 * shared by the context header's chip ring and the thread's bubble stripe.
 *
 * The role→accent RULE is `partyAccent` in @tenda/shared and is imported
 * directly by the consumers, not re-exported here. It moved because this file
 * and its mobile twin each declared the same map privately, under a docstring
 * promising the header and the thread "can never drift into calling the poster
 * one colour here and another there" — a promise that held within a client and
 * left the two CLIENTS free to disagree (#43). What legitimately stays local is
 * the table below: Tailwind needs whole class names at build time, and mobile
 * has no classes at all — its accent token doubles as a `theme.colors` key.
 *
 * The `accent` ROLE keeps its shared name; its web colour is the warning
 * base since #59e retired the amber token from the web palette. Mobile still
 * draws the same role in its amber until the mobile task retires it there.
 */
import type { PartyAccent } from '@tenda/shared'

export const ACCENT_CLASSES: Record<PartyAccent, { ring: string; stripe: string }> = {
  accent: { ring: 'ring-feedback-warning-base', stripe: 'border-l-feedback-warning-base' },
  brand: { ring: 'ring-brand-primary', stripe: 'border-l-brand-primary' },
}
