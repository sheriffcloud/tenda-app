/**
 * The content layer — every string this site states about the product, in one
 * place, the way the landing does it.
 *
 * `APP_INFO` is re-exported rather than restated: it is the ONE source of
 * product identity strings across mobile, web and the landing, and a docs site
 * that retyped the name or the pitch would be the fourth copy to drift. What
 * is docs-specific — the page's own labels — sits below it, and everything
 * about the API itself comes from the document, never from here.
 */
import type { RunBlocker } from '@/lib/run'

export { APP_INFO } from '@tenda/shared/app-info'

/** Section labels. The API's own words come from the document, not from this file. */
export const DOCS_COPY = {
  guarantees: 'What this contract guarantees',
  responses: 'Responses',
  parameters: 'Parameters',
  requestBody: 'Request body',
  sampleRecorded: 'Recorded from a real exchange',
  sampleDerived: 'Shaped from the schema',
  runLabel: 'Run',
  runningLabel: 'Running…',
  runHint: 'Runs against the demo agent — no wallet, no key.',
  liveResponse: 'Live response',
  responseHeader: 'response header',
  collapse: 'Collapse',
  required: 'required',
  /* The copy controls. This page is read by someone assembling a request in
     another window, so the URL and every body are controls, not selections. */
  copy: 'Copy',
  copied: 'Copied',
  copyRefused: 'Blocked',
  copyRefusedHint: 'The browser refused clipboard access — select the text and copy it.',
  copyEndpoint: 'Copy the full URL',
  copyBody: 'Copy this body',
  permalink: 'Link to this endpoint',
  /* The response disclosure. Every answer's shape is on the page; only the
     ones a caller does not plan for start folded away. */
  showBody: 'Show body',
  hideBody: 'Hide body',
  /* The origin. Every path on the page is relative, so without this a reader
     has the whole contract and nowhere to send it. */
  guaranteesLead: 'What the contract freezes, and what it may still add.',
  baseUrl: 'Base URL',
  baseUrlNote: 'Every path below hangs off this origin, and the Run console sends here. Paths are shown relative; the copy control beside one hands over the whole URL.',
  copyBaseUrl: 'Copy the base URL',
} as const

/**
 * What a build with no configured origin is showing, and how to fix it.
 *
 * A function because the variable's NAME is the actionable half, and it is the
 * env module's to state — a second copy typed here is the one that would
 * survive a rename.
 */
export const baseUrlUnset = (variable: string): string =>
  `This build was given no ${variable}, so it falls back to a local server. That is right for a local dev run; a DEPLOYED page showing this is misconfigured — set the variable and rebuild.`

/**
 * Where a reader finds the guarantees in the JSON, and how many there are.
 * A function because the COUNT is derived — a hand-typed one drifts the first
 * time a guarantee is added.
 */
export const guaranteesSource = (count: number, field: string): string =>
  `${count} of them, published in the document as ${field}.`

/** The expand control's words — a function because the line count IS the label. */
export const showAllLines = (lines: number): string => `Show all ${lines} lines`

/**
 * Why the Run control is off, one line per reason `runBlocker` can give. Keyed
 * by that type so a new reason is a compile error here until it has words.
 */
export const RUN_BLOCKED: Readonly<Record<RunBlocker, string>> = {
  'path-parameter': 'Needs an id in the path — read one from the feed first.',
  'no-recorded-body': 'Needs a signed body this page cannot mint — the sample below shows its shape.',
}
