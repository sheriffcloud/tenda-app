import '@testing-library/jest-dom/vitest'
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests so jsdom state never leaks across cases.
afterEach(() => {
  cleanup()
})

// jsdom gaps that radix/recharts/components rely on at render time.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub

// Next 16 client-runtime shims. jsdom has no Next router/Image/Link runtime;
// these stand in so client components under test render without the App
// Router. Server-only imports (next/headers, server-only) are intentionally
// NOT shimmed — those pages are Playwright-only (TEST_PLAN.md RSC limit).
const routerStub = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'p1' }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  // Deliberately a bare <img>: next/image's optimizer isn't available under
  // jsdom, and the mock only needs to render the element for assertions.
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />,
}))
