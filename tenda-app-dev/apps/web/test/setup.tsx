import '@testing-library/jest-dom/vitest'
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests so jsdom state never leaks across cases.
afterEach(() => {
  cleanup()
})

// jsdom gaps that UI primitives rely on at render time. Guarded because some
// suites opt into a node environment (`@vitest-environment node`) to prove
// SSR safety — there is no DOM there to patch.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (typeof window !== 'undefined' && !window.matchMedia) {
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
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  window.ResizeObserver ??= ResizeObserverStub
}

// Next 16 client-runtime shims, same set as apps/admin/test/setup.tsx. Server
// -only imports (next/headers, server-only) are deliberately NOT shimmed —
// server components are covered against a real `next start`, not jsdom.
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
  default: (allProps: { children: ReactNode; scroll?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const props = { ...allProps }
    delete props.scroll
    return <a {...props} />
  },
}))

vi.mock('next/image', () => ({
  // Deliberately a bare <img>: next/image's optimizer isn't available under
  // jsdom, and the mock only needs to render the element for assertions.
  default: (allProps: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    const props = { ...allProps }
    delete props.priority
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))
