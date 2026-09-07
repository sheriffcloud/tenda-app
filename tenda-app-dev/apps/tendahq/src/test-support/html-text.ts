/**
 * What React emits for a plain string in static markup — the five characters
 * it escapes. A test that compares content against rendered HTML needs this
 * or fails on the first apostrophe, and four tests once kept their own copy.
 * Its own test renders a string through React and checks the two agree.
 */
export function asText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
