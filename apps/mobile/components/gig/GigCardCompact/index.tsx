import type { GigSummary } from '@tenda/shared'
import { GigCardCompactPriceLeading } from './PriceLeading'
import { GigCardCompactRich } from './Rich'
import { GigCardCompactClassic } from './Classic'

export type GigCardVariant = 'priceLeading' | 'rich' | 'classic'

interface GigCardCompactProps {
  gig: GigSummary
  showStatus?: boolean
  variant?: GigCardVariant
}

export function GigCardCompact({ variant = 'priceLeading', ...props }: GigCardCompactProps) {
  switch (variant) {
    case 'rich':
      return <GigCardCompactRich {...props} />
    case 'classic':
      return <GigCardCompactClassic {...props} />
    case 'priceLeading':
    default:
      return <GigCardCompactPriceLeading {...props} />
  }
}

export { GigCardCompactPriceLeading, GigCardCompactRich, GigCardCompactClassic }
