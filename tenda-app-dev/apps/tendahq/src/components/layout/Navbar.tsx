import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { useTheme } from '@/theme/theme-context'
import { NAV_LABELS, NAV_LINKS, WEB_APP_LINK } from './nav-content'
import { cn } from '@/lib/cn'

/**
 * The nav is a sticky paper bar: the wordmark, five section links, the theme
 * switch, and two controls — the APK as an outline, the web app as the
 * page's one filled button. It never floats transparent over the hero; the
 * page has no dark ground for it to sit on, so it is always the bar.
 */
export function Navbar() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { resolved, toggle } = useTheme()

  // Close the mobile sheet on route change — state adjusted during render
  // (the React-docs pattern) instead of an effect.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--surface-navbar)] backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-5">
        <a href="/" className="flex items-center no-underline" aria-label={NAV_LABELS.brandAlt}>
          <BrandLogo height={22} />
        </a>

        <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label={NAV_LABELS.primaryNav}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-[var(--radius-button)] px-3 py-2 text-[14px] font-semibold text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-pressed)] hover:text-[var(--content-primary)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <span className="flex-1" />

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle resolved={resolved} onToggle={toggle} />
          {/* The web app is the primary way in; the APK is the alternative.
              Reversed 2026-09-01 — a visitor who cannot try the product
              without sideloading an Android build mostly does not try it. */}
          <Button href="/#download" variant="outline" size="sm">
            {NAV_LABELS.ctaDownload}
          </Button>
          <Button href={WEB_APP_LINK.href} variant="primary" size="sm">
            {WEB_APP_LINK.label}
          </Button>
        </div>

        <button
          type="button"
          aria-label={NAV_LABELS.toggleMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-[var(--radius-button)] p-2 text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-pressed)] lg:hidden"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <MobileSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        resolved={resolved}
        onToggleTheme={toggle}
      />
    </header>
  )
}

function ThemeToggle({ resolved, onToggle }: { resolved: 'light' | 'dark'; onToggle: () => void }) {
  const Icon = resolved === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      aria-label={NAV_LABELS.toggleTheme}
      aria-pressed={resolved === 'dark'}
      onClick={onToggle}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border border-[var(--border-default)] text-[var(--content-secondary)] transition-colors',
        'hover:bg-[var(--surface-pressed)] hover:text-[var(--content-primary)]',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function MobileSheet({
  open,
  onClose,
  resolved,
  onToggleTheme,
}: {
  open: boolean
  onClose: () => void
  resolved: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return (
    <div
      id="mobile-nav"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'overflow-hidden transition-[max-height,opacity] duration-300 ease-out lg:hidden',
        // The ceiling must clear the sheet's tallest state (~560px: eyebrow +
        // 5 rows + toggle + two CTAs + a two-line tagline) or overflow-hidden
        // clips the bottom.
        open ? 'max-h-[640px] opacity-100' : 'pointer-events-none max-h-0 opacity-0',
      )}
    >
      <div className="container-page py-3">
        <p className="eyebrow mb-3 text-[var(--content-tertiary)]">{NAV_LABELS.mobileEyebrow}</p>

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)]">
          {NAV_LINKS.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={cn(
                'flex items-center justify-between px-4 py-4 no-underline text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-pressed)]',
                index !== 0 && 'border-t border-[var(--border-subtle)]',
              )}
            >
              <span className="title">{link.label}</span>
              <ChevronRight className="h-4 w-4 text-[var(--content-tertiary)]" />
            </a>
          ))}

          <div className="border-t border-[var(--border-subtle)] p-4">
            <ThemeToggle resolved={resolved} onToggle={onToggleTheme} />
            <Button href={WEB_APP_LINK.href} variant="primary" size="md" fullWidth className="mt-3">
              {WEB_APP_LINK.label}
            </Button>
            <Button href="/#download" variant="outline" size="md" fullWidth className="mt-2">
              {NAV_LABELS.ctaDownload}
            </Button>
            <p className="caption mt-3 text-center text-[var(--content-tertiary)]">
              {NAV_LABELS.mobileTagline}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
