import { BriefcaseBusiness, Coins, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/lib/routes'
import { sellHref } from '@/components/wallet/sell/copy'

export interface CreateOption {
  href: string
  menuLabel: string
  title: string
  description: string
  icon: LucideIcon
}

/**
 * Mobile's FAB pairing, verbatim (spec-correction #50): "Post a Gig" and
 * "Sell / Cash out". There is no third "create offer" concept — posting an
 * offer is a MODE of selling, the second tab on the sell surface.
 */
export const CREATE_OPTIONS: readonly CreateOption[] = [
  {
    href: ROUTES.createGig,
    menuLabel: 'Create gig',
    title: 'Create a gig',
    description: 'Fund a task and publish it for people to take.',
    icon: BriefcaseBusiness,
  },
  {
    href: sellHref('instant'),
    menuLabel: 'Sell / Cash out',
    title: 'Sell / Cash out',
    description: 'Cash out at the market rate, or post a P2P offer at yours.',
    icon: Coins,
  },
] as const
