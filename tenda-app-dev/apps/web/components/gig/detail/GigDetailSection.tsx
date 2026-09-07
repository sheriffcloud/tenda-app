/**
 * A ruled section on the gig detail — eyebrow heading, hairline above, one
 * rhythm. Four of them in the comp (brief, terms, proof, posted by), all
 * identical apart from their contents.
 *
 * A RULE, not a card (#60): the preview draws the article as one column of
 * ruled sections under the header card, so the eye reads down one document
 * rather than across five boxes. The eyebrow takes the secondary tone here —
 * it is a section title, not a caption.
 */
import type { ReactNode } from 'react'
import { Eyebrow } from '@/components/ui'

export function GigDetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-[30px] border-t border-border-default pt-[22px]">
      <Eyebrow as="h2" tone="secondary" className="mb-3.5">
        {title}
      </Eyebrow>
      {children}
    </section>
  )
}
