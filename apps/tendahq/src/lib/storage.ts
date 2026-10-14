/**
 * localStorage, guarded. The `window.localStorage` GETTER itself throws in
 * Chrome when the visitor blocks site data, and in some private windows — a
 * SecurityError during the first render, which is a blank page. Every read
 * and write on this site goes through here, so a blocked store degrades to
 * "nothing remembered" rather than to nothing rendered. Off the browser
 * (tests, a static render) `window` is absent and the same catch answers.
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The preference is simply not remembered.
  }
}
