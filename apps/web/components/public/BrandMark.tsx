/**
 * The linked full wordmark used by public and focused chrome. The image pair is
 * centralized in BrandLogo so theme variants and dimensions cannot drift.
 */
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { BrandLogo } from '@/components/brand/BrandLogo'

/**
 * The official compact mark at whatever size the surface needs.
 */
export function BrandTile({ size = 36, className }: { size?: number; className?: string }) {
  return <BrandLogo size={size} className={className} />
}

export function BrandMark({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('flex items-center text-content-primary', className)}
    >
      <BrandLogo full />
    </Link>
  )
}
