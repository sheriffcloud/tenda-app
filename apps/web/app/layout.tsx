import type { Metadata } from 'next'
import { JetBrains_Mono, Manrope, Space_Grotesk } from 'next/font/google'
import { APP_INFO } from '@tenda/shared'
import { siteUrl } from '@/lib/config/site-url'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { ToastHost } from '@/components/ui/Toast'
import './globals.css'

// The three faces are MOBILE's (apps/mobile/theme/tokens.ts `typography.fonts`,
// #59a): Space Grotesk for display, Manrope for body, JetBrains Mono for
// figures and eyebrows — the same trio tendahq self-hosts. Inter (#44) and the
// brief Outfit detour (2026-09-01) are gone. Only `globals.css` binds the
// variables to the `font-*` roles, and `scripts/__tests__/faces.test.ts`
// fails if this file loads a face the tokens do not name. Variable fonts, so
// every weight the atoms set is one file each.
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
})

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

// No `weight` pin: mobile registers 400–800 faces for mono and the app sets
// bold figures (`font-numeric font-bold`), which a 400–600 pin left the browser
// to synthesise. Omitting `weight` loads the variable font's whole axis.
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: APP_INFO.name, template: `%s | ${APP_INFO.name}` },
  description: APP_INFO.description,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Paints an explicit theme choice before hydration — no light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Global: toasts must survive route changes AND fire from the public
            group (the gig detail island toasts there). */}
        <ToastHost />
      </body>
    </html>
  )
}
