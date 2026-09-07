'use client'

/**
 * Step 2 — the words a stranger has to work from.
 *
 * The labels are associated by `htmlFor`/`id` rather than by wrapping, which
 * is also what the comp does. A wrapping label folds everything inside it into
 * the field's accessible name: the hint and the live character counter came
 * along, so the name read "TitleSay what, where and when…7/80" and changed on
 * every keystroke. It also put the hint's `<p>` inside a `<span>`, which is
 * not valid content.
 */
import { DESC_MAX, TITLE_MAX } from '@tenda/shared'
import { controlClassName } from '@/components/ui/TextField'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { CharCounter, FieldNote } from './parts'
import type { GigFormController } from '@/hooks/gig/useGigForm'

export function BriefStep({ form }: { form: GigFormController }) {
  return (
    <div className="mt-7 flex max-w-[640px] flex-col gap-6">
      <div>
        {/* tone="input", as TextField's label: read while typing, so it earns
            the darker of the two plausible tokens. */}
        <Eyebrow as="label" htmlFor="gig-title" tone="input" className="block">
          Title
        </Eyebrow>
        <input
          id="gig-title"
          className={`${controlClassName} mt-2.5`}
          placeholder="Same-day delivery of 12 boxes across Lekki"
          value={form.title}
          maxLength={TITLE_MAX}
          onChange={(e) => form.setTitle(e.target.value)}
        />
        <div className="mt-2 flex justify-between gap-3">
          <FieldNote>Say what, where and when. This is the line people scan.</FieldNote>
          <CharCounter value={form.title} max={TITLE_MAX} />
        </div>
      </div>

      <div>
        <Eyebrow as="label" htmlFor="gig-brief" tone="input" className="block">
          The brief
        </Eyebrow>
        <textarea
          id="gig-brief"
          rows={7}
          className={`${controlClassName} mt-2.5 resize-y`}
          placeholder="Addresses, hours, constraints, and what would count as done."
          value={form.description}
          maxLength={DESC_MAX}
          onChange={(e) => form.setDescription(e.target.value)}
        />
        <div className="mt-2 flex justify-between gap-3">
          <FieldNote>{form.descriptionHint}</FieldNote>
          <CharCounter value={form.description} max={DESC_MAX} />
        </div>
      </div>
    </div>
  )
}
