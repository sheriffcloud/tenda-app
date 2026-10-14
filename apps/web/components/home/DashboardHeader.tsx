'use client'

/**
 * The dashboard's head (#60): the day as an eyebrow, the greeting as the h1
 * ending on the blue period, and the two actions the preview puts beside it.
 * The name is the reader's first name; with none on file the greeting stands
 * alone rather than addressing "null".
 */
import Link from 'next/link'
import type { User } from '@tenda/shared'
import { BrandPeriod } from '@/components/public/BrandPeriod'
import { buttonVariants } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useNow } from '@/hooks/timing/useNow'
import { HOME_COPY } from './copy'
import { dateLine, greetingFor } from './greeting'

export const HOME_ACTION_HREF = { trade: '/wallet/buy-sell', post: '/create' } as const

export function DashboardHeader({ user }: { user: User | null }) {
  const now = new Date(useNow())
  const name = user?.first_name?.trim() ?? ''
  return (
    <div className="flex flex-wrap items-end gap-5">
      <div className="min-w-0">
        <Eyebrow>{dateLine(now)}</Eyebrow>
        <h1 className="type-h1 mt-2.5 text-content-primary">
          <BrandPeriod text={`${greetingFor(now.getHours())}${name === '' ? '' : `, ${name}`}.`} />
        </h1>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <Link href={HOME_ACTION_HREF.trade} className={buttonVariants({ variant: 'outline', size: 'md' })}>
          {HOME_COPY.actions.trade}
        </Link>
        <Link href={HOME_ACTION_HREF.post} className={buttonVariants({ variant: 'primary', size: 'md' })}>
          {HOME_COPY.actions.post}
        </Link>
      </div>
    </div>
  )
}
