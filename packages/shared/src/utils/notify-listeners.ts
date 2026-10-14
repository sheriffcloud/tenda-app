/** Deliver independently so one feature listener cannot block its siblings. */
export function notifyListeners<T>(listeners: Iterable<(value: T) => void>, value: T): void {
  for (const listener of listeners) {
    try {
      listener(value)
    } catch {
      // Listener ownership stays with its feature; transport delivery continues.
    }
  }
}
