/**
 * A headline that ends on the blue period — tendahq's `Period`, the one mark
 * of the Receipt direction a heading carries (#60). The text is passed WHOLE
 * and the trailing full stop is what gets the colour, so a string shared owns
 * (`APP_INFO.tagline`) is rendered verbatim rather than retyped without its
 * period; a text that does not end on one is rendered untouched.
 */
export function BrandPeriod({ text }: { text: string }) {
  if (!text.endsWith('.')) return <>{text}</>
  return (
    <>
      {text.slice(0, -1)}
      <span className="text-brand-primary">.</span>
    </>
  )
}
