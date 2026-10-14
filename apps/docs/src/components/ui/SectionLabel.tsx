/**
 * The small uppercase label above a section — "Responses", "Parameters", a tag
 * name in the rail, the caption on a code block.
 *
 * One component rather than the same six utility classes repeated down five
 * files: the eyebrow is a type ROLE on this page, and a role that is spelled
 * out per call site drifts the first time one of them is adjusted.
 *
 * `as` is a closed union rather than a generic element type: the label appears
 * as a heading where it introduces a section and as a span where it captions
 * something inside one, and nothing on this page needs a third.
 */
export function SectionLabel({
  children,
  as = 'span',
}: {
  children: React.ReactNode
  as?: 'h2' | 'h4' | 'span'
}) {
  const Tag = as
  return (
    <Tag
      className="font-mono text-[10px] font-semibold uppercase tracking-[0.9px]"
      style={{ color: 'var(--content-tertiary)', margin: 0 }}
    >
      {children}
    </Tag>
  )
}
