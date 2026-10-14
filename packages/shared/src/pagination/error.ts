/**
 * The message a failed page load shows.
 *
 * Both clients' `usePaginatedList` had this exact function inline, so a list
 * that failed to load could word it two ways. It is here for the same reason
 * `formatProofTypeList` is: a failure the reader sees should read as one
 * product, not as whichever client happened to render it.
 */
export function pageLoadErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}
