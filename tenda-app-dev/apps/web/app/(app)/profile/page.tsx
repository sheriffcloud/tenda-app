'use client'

/**
 * Own profile — web port of mobile's profile tab: restriction banner,
 * hero (avatar/name/rating with its review count), server-COUNT stats
 * (posted excludes drafts), the completed-work chips, quick links, and what
 * the account has verified.
 *
 * The chips sit between the totals and the links, which is where the comp puts
 * them; the quick-link nav between them and Verified is web's own addition and
 * does not move them.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import { ClipboardList, Scale, Settings, UserPen, Wallet } from 'lucide-react'
import { displayName, formatFullName } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  CompletedWork,
  ProfileRating,
  RestrictionBanner,
  SignOutButton,
  VerifiedBlock,
} from '@/components/profile'
import { useProfileStats } from '@/hooks/profile/useProfileStats'
import { WorkspacePage } from '@/components/app/workspace'

const LINK_CLASS =
  'flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm font-semibold text-content-primary transition-colors hover:bg-surface-inset'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const identities = useAuthStore((s) => s.identities)
  const wallets = useAuthStore((s) => s.wallets)
  const ensureWallets = useAuthStore((s) => s.ensureWallets)
  const loadMethods = useAuthStore((s) => s.loadMethods)
  const stats = useProfileStats(user?.id)

  useEffect(() => {
    void loadMethods()
    void ensureWallets()
  }, [loadMethods, ensureWallets])

  if (user === null) return null

  const fullName = formatFullName(user.first_name, user.last_name) || 'Anonymous'
  return (
    <WorkspacePage className="flex flex-col gap-5">
      <RestrictionBanner />

      <header className="flex items-center gap-4">
        <Avatar name={fullName} src={user.avatar_url} size="md" className="scale-125" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-content-primary">
            {displayName(user.first_name, user.last_name, user.id)}
          </h1>
          <p className="text-sm text-content-secondary">
            {[user.city, user.country].filter(Boolean).join(', ') || 'Location not set'}
            {user.is_seeker && ' · Seeker'}
          </p>
          <ProfileRating
            score={user.review_score}
            reviews={stats.reviews}
            loaded={stats.status === 'ready'}
          />
        </div>
        <Link href="/profile/edit" className={LINK_CLASS}>
          <UserPen size={16} /> Edit
        </Link>
      </header>

      {/* The rating moved to the line under the name, where the comp puts it
          and where its review COUNT sits beside it. Repeating a bare "4.8"
          here would restate the average without its denominator. */}
      <section aria-label="Activity">
        {stats.status === 'error' ? (
          /* The counts failed. Saying so and offering the read again is the
             whole point: this block used to print "Posted 0 · Completed 0",
             which is a claim about the account rather than about the request,
             and the reader had no way to tell the two apart or to try again. */
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-card border border-border-subtle bg-surface-card p-4"
          >
            <p className="flex-1 text-sm text-content-secondary">
              Couldn&apos;t load your activity.
            </p>
            <Button variant="outline" onClick={stats.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Posted', value: stats.status === 'ready' ? String(stats.posted) : '—' },
              { label: 'Completed', value: stats.status === 'ready' ? String(stats.completed) : '—' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-card border border-border-subtle bg-surface-card p-4 text-center">
                <p className="font-numeric text-xl font-bold text-content-primary">{stat.value}</p>
                <p className="text-xs text-content-tertiary">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Between the two totals and the account links, where the comp puts
          it. Absent entirely until there is work behind it. */}
      <CompletedWork userId={user.id} />

      <nav className="flex flex-col gap-2" aria-label="Account">
        <Link href="/my-gigs" className={LINK_CLASS}>
          <ClipboardList size={16} /> My gigs
          {stats.active > 0 && <span className="ml-auto text-xs text-content-tertiary">{stats.active} active</span>}
        </Link>
        <Link href="/wallet" className={LINK_CLASS}>
          <Wallet size={16} /> Wallet
        </Link>
        <Link href="/disputes" className={LINK_CLASS}>
          <Scale size={16} /> My disputes
        </Link>
        <Link href="/settings" className={LINK_CLASS}>
          <Settings size={16} /> Settings
        </Link>
      </nav>

      {/* The full sign-in-method list lived here and now does not: it
          duplicated /settings/security (which it linked to in its own
          footnote), and it listed ATTACHED methods next to verified ones
          under the same heading. What belongs on a profile is what the
          account has proved. */}
      <VerifiedBlock identities={identities} wallets={wallets} />

      {/* Also on /settings and the workspace rail, so sign-out remains reachable
          from both account context and global navigation. */}
      <SignOutButton />
    </WorkspacePage>
  )
}
