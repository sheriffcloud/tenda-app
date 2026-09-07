import { useTheme } from '@/theme/theme-context'
import { cn } from '@/lib/cn'
import wordmarkDark from '@/assets/tenda-wordmark.png'
import wordmarkWhite from '@/assets/tenda-wordmark-white.png'

interface Props {
  /** Rendered height in px (the wordmark is 1000×266). */
  height?: number
  className?: string
}

/**
 * The tenda wordmark image (navy glyphs + blue period; white variant on
 * dark). Theme-aware — always use this instead of hand-set text so the
 * header/footer carry the actual logo.
 */
export function BrandLogo({ height = 24, className }: Props) {
  const { resolved } = useTheme()
  return (
    <img
      src={resolved === 'dark' ? wordmarkWhite : wordmarkDark}
      alt="Tenda"
      style={{ height, width: 'auto' }}
      // self-start: in column-flex parents the default stretch would pull the
      // img to full column width and destroy the aspect ratio.
      className={cn('select-none self-start', className)}
      draggable={false}
    />
  )
}
