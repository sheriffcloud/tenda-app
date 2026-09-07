/**
 * One ruled section of /foundations (comp lines 769, 784, 795): a hairline, a
 * heading, an optional sentence, then the content.
 *
 * Three of them in the comp, all the same shape — so the shape is here and
 * each section supplies only what it shows.
 */
import type { ReactNode } from 'react'

export function FoundationsSection({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section className="mt-12 border-t border-border-default pt-8">
      <h2 className="type-h2 text-content-primary">
        {title}
      </h2>
      {intro !== undefined && (
        <p className="mt-2 max-w-[60ch] type-body text-content-secondary">
          {intro}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  )
}
