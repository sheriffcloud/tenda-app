/**
 * "How you will appear on a gig card" (Auth comp, lines 558-565).
 *
 * The reason this earns its space: the name typed here is the one strangers
 * judge before accepting your escrow, and a first-run form gives no other clue
 * what it will look like. The preview uses the SAME `Avatar` and the same
 * shared `formatFullName` the gig card does, so it is a preview rather than an
 * impression of one — a hand-rolled circle with hand-rolled initials would
 * drift from the card it claims to show.
 *
 * `formatFullName`, not `displayName`: the fallback here is a placeholder for
 * a name not yet typed, and `displayName`'s "User 3f2a1b8c" is a STAFF-surface
 * answer that would read as a broken preview to someone halfway through the
 * field.
 */
import { formatFullName } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { AUTH_COPY } from './copy'

export function NamePreview({
  firstName,
  lastName,
}: {
  firstName: string
  lastName: string
}) {
  const name = formatFullName(firstName, lastName)
  const shown = name === '' ? AUTH_COPY.profile.previewEmpty : name

  return (
    <div className="flex items-center gap-3.5 rounded-card border border-border-subtle bg-surface-inset p-4">
      {/* `name` and not `shown`: an empty name must give the Avatar's own
          empty state, not initials derived from the placeholder text. */}
      <Avatar size="md" name={name} src={null} />
      <div className="min-w-0">
        <p
          className={`truncate font-semibold leading-[22px] ${
            name === '' ? 'text-content-tertiary' : 'text-content-primary'
          }`}
        >
          {shown}
        </p>
        <p className="type-body-small text-content-tertiary">
          {AUTH_COPY.profile.previewCaption}
        </p>
      </div>
    </div>
  )
}
