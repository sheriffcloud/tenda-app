/**
 * The rail: every operation this document defines, grouped by its tags.
 *
 * A reference is used by someone who already knows what they came for, so the
 * whole surface is visible at once and one click away. It is a sticky column
 * beside the text on a wide screen and a list above it on a narrow one — the
 * rule moves with it, rather than leaving a border down the side of a phone.
 *
 * It is generated from the document, so an endpoint cannot exist in the JSON
 * and be missing from the navigation.
 */
import { anchorFor, type TaggedOperations } from '@/lib/document'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'

export function Rail({ tags }: { tags: readonly TaggedOperations[] }) {
  return (
    <nav
      aria-label="Operations"
      className="grid content-start gap-5 border-b pb-6 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {tags.map((tag) => (
        <div key={tag.name} className="grid gap-1.5">
          <SectionLabel>{tag.name}</SectionLabel>
          <ul className="grid gap-1 pl-0" style={{ listStyle: 'none', margin: 0 }}>
            {tag.operations.map(({ operation, method, path }) => (
              <li key={operation.operationId} className="flex items-baseline gap-2">
                <Chip tone={method === 'POST' ? 'brand' : 'ok'}>{method}</Chip>
                <a
                  href={`#${anchorFor(operation.operationId)}`}
                  title={operation.summary}
                  className="truncate font-mono text-[12px] leading-[18px] hover:underline"
                  style={{ color: 'var(--content-secondary)' }}
                >
                  {path}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
