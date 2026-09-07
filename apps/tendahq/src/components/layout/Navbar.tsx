import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { useTheme } from '@/theme/theme-context'
import { NAV_LABELS, NAV_LINKS } from './nav-content'
import { cn } from '@/lib/cn'

export function Navbar() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { resolved, toggle } = useTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile sheet on route change — state adjusted during render
  // (the React-docs pattern) instead of an effect.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  const elevated = scrolled || !isHome || menuOpen

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          'w-full transition-[backdrop-filter,background-color,border-color,box-shadow] duration-200',
          elevated
            ? 'border-b border-[var(--border-subtle)] bg-[var(--surface-navbar)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.06)]'
            : 'border-b border-transparent bg-transparent backdrop-blur-md',
        )}
      >
        <div className="container-page flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline" aria-label={NAV_LABELS.brandAlt}>
            <BrandLogo height={22} />
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="body-sm font-medium text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle resolved={resolved} onToggle={toggle} />
            <Button href="/#download" variant="primary" size="sm">
              {NAV_LABELS.ctaDownload}
            </Button>
          </div>

          <button
            type="button"
            aria-label={NAV_LABELS.toggleMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-xl p-2 text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-bg-alt)] md:hidden"
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
      </div>
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
        'inline-flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--content-primary)] transition-colors',
        'hover:bg-[var(--surface-bg-alt)]',
        resolved === 'dark'
          ? 'border-[var(--border-default)] bg-[color-mix(in_oklab,var(--brand-surface)_60%,transparent)] text-[var(--brand)]'
          : 'border-transparent',
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
      className={cn(
        'overflow-hidden transition-[max-height,opacity] duration-300 ease-out md:hidden',
        open ? 'max-h-[480px] opacity-100' : 'pointer-events-none max-h-0 opacity-0',
      )}
    >
      <div className="container-page py-3">
        <p className="eyebrow mb-3 text-[var(--content-tertiary)]">{NAV_LABELS.mobileEyebrow}</p>

        <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)]">
          {NAV_LINKS.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={cn(
                'flex items-center justify-between px-4 py-4 no-underline text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-bg-alt)]',
                index !== 0 && 'border-t border-[var(--border-subtle)]',
              )}
            >
              <span className="body font-medium">{link.label}</span>
              <ChevronRight className="h-4 w-4 text-[var(--content-tertiary)]" />
            </a>
          ))}

          <div className="border-t border-[var(--border-subtle)] p-4">
            <ThemeToggle resolved={resolved} onToggle={onToggleTheme} />
            <Button href="/#download" variant="primary" size="md" fullWidth className="mt-3">
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
