'use client'

/**
 * The settings index cards (comp: icon, title, blurb, optional badge).
 *
 * Icons are matched to the card by href rather than carried in the copy
 * module, so the copy stays plain data and this file owns the presentation.
 */
import Link from 'next/link'
import { KeyRound, Landmark, ShieldCheck, User, Wallet, type LucideIcon } from 'lucide-react'
import { SETTINGS_CARDS, type SettingsCard } from './copy'

const ICONS: Record<string, LucideIcon> = {
  '/settings/security': KeyRound,
  '/settings/linked-wallets': Wallet,
  '/settings/bank-accounts': Landmark,
  '/settings/token-approvals': ShieldCheck,
  '/profile': User,
}

export function SettingsCardGrid({ badges }: { badges: Record<string, string | undefined> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SETTINGS_CARDS.map((card) => {
        // Fallback is unreachable while every card has an entry above, and
        // stays as the answer for a card added without one — a generic glyph
        // beats a crash.
        const Icon = ICONS[card.href] ?? User
        const badge = badges[card.href]
        return <Card key={card.href} card={{ ...card, badge }} Icon={Icon} />
      })}
    </div>
  )
}

function Card({ card, Icon }: { card: SettingsCard; Icon: LucideIcon }) {
  return (
    <Link
      href={card.href}
      className="flex gap-3 rounded-card border border-border-default bg-surface-card p-4 transition-colors hover:bg-surface-inset"
    >
      <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-content-secondary" />
      <span className="min-w-0 flex-1">
        <span className="block font-display type-body font-semibold text-content-primary">
          {card.title}
        </span>
        <span className="mt-1 block type-body-small text-content-secondary">
          {card.blurb}
        </span>
        {card.badge !== undefined && (
          <span className="mt-2.5 inline-block rounded-full border border-border-default bg-surface-inset px-2.5 py-0.5 type-caption font-semibold text-content-tertiary">
            {card.badge}
          </span>
        )}
      </span>
    </Link>
  )
}
