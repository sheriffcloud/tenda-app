/**
 * How this document formats its own prose.
 *
 * Operation descriptions are CommonMark — OpenAPI says so, and both consumers
 * render them as such. These two helpers are the whole vocabulary, in one
 * place, because the alternative is each path file joining its paragraphs its
 * own way and one of them eventually getting it wrong: CommonMark separates
 * blocks by a BLANK line, and a single newline is folded into a space.
 *
 * That fold is not hypothetical. The auth-message template was concatenated
 * into a paragraph under the words "newlines included", and rendered as one
 * long line — so a reader who copied what the page showed signed the wrong
 * bytes and met a 401 that named no cause.
 */

/** Paragraphs and blocks, joined the way CommonMark wants them separated. */
export const blocks = (...parts: readonly string[]): string => parts.join('\n\n')

/**
 * A verbatim block, for the places where the BYTES matter and not the words.
 *
 * Untagged on purpose: what goes in here is a message to sign, not a language
 * a highlighter knows.
 */
export const fence = (body: string): string => '```\n' + body + '\n```'

/** One bullet per line — a list is a single block, so its lines are NOT blank-separated. */
export const bullets = (...items: readonly string[]): string => items.map((item) => `- ${item}`).join('\n')

/** A numbered list, for the places where the ORDER is the instruction. */
export const steps = (...items: readonly string[]): string =>
  items.map((item, index) => `${index + 1}. ${item}`).join('\n')
