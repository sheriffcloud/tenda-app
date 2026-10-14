import Image from 'next/image'
import { APP_INFO } from '@tenda/shared'
import { cn } from '@/lib/cn'

interface BrandLogoProps {
  full?: boolean
  size?: number
  priority?: boolean
  className?: string
}

export function BrandLogo({ full = false, size = 36, priority = false, className }: BrandLogoProps) {
  const dimensions = full ? { width: 112, height: 30 } : { width: size, height: size }
  const lightThemeSource = full ? '/logo_full_dark.png' : '/logo_dark.png'
  const darkThemeSource = full ? '/logo_full.png' : '/logo.png'
  return (
    <span
      className={cn('relative block shrink-0', full && 'h-[30px] w-28', className)}
      style={full ? undefined : { width: size, height: size }}
    >
      <Image {...dimensions} src={lightThemeSource} alt={APP_INFO.name} priority={priority || undefined} className="h-full w-full object-contain" data-brand-light />
      <Image {...dimensions} src={darkThemeSource} alt="" priority={priority || undefined} aria-hidden className="absolute inset-0 h-full w-full object-contain" data-brand-dark />
    </span>
  )
}
