/**
 * Copy text to the clipboard, reporting whether it actually worked.
 *
 * THIS LIVES IN `lib/` RATHER THAN INSIDE THE BUTTON because it is the only
 * part of copying that can go wrong, and coverage instruments `src/content/**`
 * and `src/lib/**` — a component holding this logic would have carried an
 * untested failure path while the suite reported full coverage. It follows the
 * precedent vitest.config.ts already names: `toPercent` is pure logic pulled
 * out of a network module for exactly this reason.
 *
 * TWO WAYS THIS FAILS, and neither throws where a caller would expect it:
 *
 *   - `navigator.clipboard` is UNDEFINED on an insecure origin and in some
 *     in-app browsers, so the property access itself throws a TypeError before
 *     any promise exists. That is why the access is inside the `try` and not
 *     merely the await.
 *   - `writeText` REJECTS when the document is not focused or permission is
 *     denied.
 *
 * Returns false rather than rethrowing: a copy button has nothing useful to do
 * with the error object, and the one thing it must not do is show a
 * confirmation for a copy that never happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
