/**
 * The poster's own words (comp lines 601-607).
 *
 * The comp renders `gig.paragraphs`; the wire carries ONE `description`
 * string, which posters write with blank lines in it. Splitting on blank
 * lines gives the comp's typography without inventing a field — and a
 * `whitespace-pre-line` blob, which is what this rendered before, collapses
 * a poster's paragraph breaks into single line breaks at 28px leading.
 *
 * An absent brief says so. A gig with no description is legal (the field is
 * nullable) and its terms are then the entire agreement, which a reader
 * should be told rather than left to infer from empty space.
 */
import { GIG_DETAIL_COPY } from './copy'

/** Blank-line-separated blocks, trimmed and emptied of blanks. */
export function briefParagraphs(description: string | null): string[] {
  if (description === null) return []
  return description
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
}

export function GigBrief({ description }: { description: string | null }) {
  const paragraphs = briefParagraphs(description)

  if (paragraphs.length === 0) {
    return <p className="max-w-[66ch] text-content-tertiary">{GIG_DETAIL_COPY.briefEmpty}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          // `break-words`: the brief is poster-written and posters paste
          // links into it. `max-w-[66ch]` caps the measure but does nothing
          // for a single token longer than the column.
          // See CLAUDE.md, "text a poster wrote".
          className="max-w-[66ch] whitespace-pre-line text-pretty break-words text-[17px] leading-7 text-content-primary"
        >
          {paragraph}
        </p>
      ))}
    </div>
  )
}
