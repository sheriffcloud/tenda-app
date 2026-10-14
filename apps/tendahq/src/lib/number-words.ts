const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const

/**
 * A small count as a word, for prose that reads a derived number aloud —
 * "Five exits · four need nobody but you". Past nine it falls back to the
 * numeral, which is also how a sentence would be written.
 */
export function numberWord(n: number, capitalise = false): string {
  const word = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
  return capitalise ? word.charAt(0).toUpperCase() + word.slice(1) : word
}
