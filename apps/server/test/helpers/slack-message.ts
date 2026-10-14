/**
 * Reading a `SlackMessage` — the four questions every Slack copy suite asks.
 *
 * Extracted when alerts-slack-copy.test.ts was split (task #45): three files
 * now assert against the same message shape, and a fourth
 * (alerts-slack-gas-seed-copy.test.ts) had already hand-rolled a
 * character-for-character copy of the first three functions. Four copies of
 * "what does this message actually say" is four chances for one of them to
 * quietly stop looking at the context block.
 *
 * Deliberately READ-ONLY and assertion-free: these turn a message into
 * strings, and the suites decide what is true of them. A helper that asserted
 * would put the interesting half of each test somewhere the test does not
 * mention.
 */
import type { SlackMessage } from '@server/features/alerts/slack'

// `flatMap` rather than `filter().map()`: filter does not narrow a
// discriminated union, so the map would need a cast to reach `.text`.

/** The text of every `section` block, in order. */
export function sectionTexts(msg: SlackMessage): string[] {
  return (msg.blocks ?? []).flatMap((b) => (b.type === 'section' ? [b.text.text] : []))
}

/** The text of every element of every `context` block, in order. */
export function contextTexts(msg: SlackMessage): string[] {
  return (msg.blocks ?? []).flatMap((b) =>
    b.type === 'context' ? b.elements.map((e) => e.text) : [],
  )
}

/** Everything an operator would actually see, fallback text included. */
export function allText(msg: SlackMessage): string {
  return [msg.text, ...sectionTexts(msg), ...contextTexts(msg)].join('\n')
}
