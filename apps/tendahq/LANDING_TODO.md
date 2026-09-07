# Tenda Landing v2 — Implementation Tracker

> **⚠ 2026-07-19 multichain rework supersedes parts of this tracker.** The
> Solana-only story was replaced with the multichain (Solana · Base · Celo)
> landing. What changed:
>
> - **Removed sections:** §02 trust strip, §05 live ticker, §06 why-tenda,
>   §07 coverage map, §08 three audiences (all ran on `placeholder: true`
>   mock numbers — M75–M78 no longer block launch).
> - **New sections:** task wall (`sections/task-wall/`, vertical marquees of
>   example gigs), onboarding rails (`sections/onboarding/`, gas story per
>   chain), ecosystems + grants (`sections/ecosystems/`).
> - **New hero:** TaskDeck swipe-up stack replaces the escrow wall; chain
>   badges under the CTAs. Exchange panel gained the TradeDeck (crypto → fiat
>   corridors). Headline unchanged.
> - **Content centralised in `src/content/`** (app-info, tasks, trades,
>   features, ecosystems, chains). Chain facts derive from
>   `@tenda/shared` CHAIN_MANIFEST. See README.
> - **Theme fix:** `data-theme` token blocks now match on any element, so
>   `SectionShell` tone pinning actually works.
>
> The phase tables below are kept for history; treat file paths that no
> longer exist as removed by the rework.

> Single source of truth for the landing-page rebuild. Update statuses inline as tasks complete.
> **Use checkboxes:** `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked / needs decision · `[-]` skipped (with reason).

---

## Reference docs

| Document | What it gives you |
|---|---|
| `apps/tendahq/LANDING_DESIGN_BRIEF.md` | The brief sent to the design agent. Authoritative for IA, brand tokens, motion. |
| `apps/tendahq/Tenda V2/landing/IMPLEMENTATION.md` | Designer's hand-off doc. 12 sections, decisions log, production-conversion checklist. |
| `apps/tendahq/Tenda V2/landing/landing.css` | Designer's token + type-atom contract. Names (`.h-hero`, `.body-lg`, `.eyebrow`, `.mono-large` …) are the migration contract. |
| `apps/tendahq/Tenda V2/landing/sections/*.html` | Wireframe markup per section. Copy lives inline. |
| `apps/tendahq/Tenda V2/landing/landing.html` | Stitched composition order — the order this app should render in. |
| `apps/mobile/theme/tokens.ts` | **Source of truth for every brand token** (colours, type, radius, spacing, motion). Adopt 1:1. |
| `packages/shared/src/constants/currencies.ts` | 8 supported fiat currencies + flags. |
| `packages/shared/src/constants/categories.ts` | 5 gig categories (delivery, photo, errand, service, digital). |
| `apps/server/src/routes/v1/platform/index.ts` | The two real public endpoints. |
| `open_issues.md` | M75–M84 — backend gaps and decisions affecting the landing. |

---

## Reference: live API surface

| Endpoint | Reply | Used in |
|---|---|---|
| `GET /v1/health` | `{ status, uptime }` | health badge in footer (optional) |
| `GET /v1/health/ready` | `{ status }` or 503 | unused on landing |
| `GET /v1/platform/config` | `{ fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 86400 }` | §02 trust strip · §06 pillar 2 · §10 receipts |
| `GET /v1/platform/exchange-rates` | `{ rates: { NGN, KES, ZAR, PHP, USD, GBP, EUR }, fetched_at }` | §01 hero marquee · §11 footer status (GHS missing — fallback gracefully) |

**Verified:** poster fee = 2.5%, worker fee = 1.0%, grace = 24h. Use these numbers, not the wireframe's `1.5% poster only`.

## Reference: placeholder data (must be wired before public launch)

Tracked in `data/stats.ts` with `placeholder: true` flag. Grep `placeholder: true` to audit.

| Field | Wireframe value | Endpoint needed | Issue |
|---|---|---|---|
| `volume24hUsd` | `$3.42M` | `GET /v1/public/stats/24h` | M75 |
| `volumeDeltaPct` | `↑ 11.3%` | same | M75 |
| `settlements24h` | `8,407` | same | M75 |
| `avgSettlementSeconds` | `1.7s` | `GET /v1/public/stats/rolling` | M76 |
| `disputeRateBps` | `40` (= 0.4%) | same | M76 |
| `weekGigs` | `12,847` | same | M76 |
| `coveragePings` | placeholder coords | `GET /v1/public/coverage` | M78 |
| `liveFeedRows` | static mocks | `GET /v1/public/feed/live` | M77 |
| `iosWaitlistEmail` | mailto for v1 | `POST /v1/public/waitlist/ios` | M79 |

---

## Phase 0 · Foundations

Files: `package.json`, `src/index.css`, `src/main.tsx`, `src/env.ts`, `.env.example`, `src/theme/ThemeProvider.tsx`, `src/lib/*`

- [x] **0.1** Install font packages: `@fontsource-variable/space-grotesk`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`
- [x] **0.2** Wire font imports in `src/main.tsx` (or `index.css` `@import`)
- [x] **0.3** Rewrite `src/index.css`:
  - [x] **0.3.1** Replace `:root` palette with mobile tokens — verify each value against `apps/mobile/theme/tokens.ts` (`#2E5BD6`, `#3ACB8E`, `#F7F5F0`, `#0D1018`, etc.)
  - [x] **0.3.2** Add `--display`, `--body`, `--mono` font vars
  - [x] **0.3.3** Add category tones (`--cat-delivery`, `--cat-photo`, `--cat-errand`, `--cat-service`, `--cat-digital`)
  - [x] **0.3.4** Port type atoms from `landing.css` as utility classes: `.h-hero`, `.h-hero-mobile`, `.h1`, `.h2`, `.h3`, `.body-lg`, `.body`, `.body-sm`, `.eyebrow`, `.caption`, `.mono-large`, `.mono-mid`, `.mono-sm`
  - [x] **0.3.5** Light-/dark-mode swap via `[data-theme="dark"]` selector AND `prefers-color-scheme: dark`
  - [x] **0.3.6** Keep existing `.app-shell`, `.app-main`, `.gradient-text`, `.hairline-divider` utilities or replace with new equivalents
- [x] **0.4** Create `.env.example` documenting `VITE_API_BASE_URL`
- [x] **0.5** Create `.env.development` with `VITE_API_BASE_URL=http://127.0.0.1:3000`
- [x] **0.6** Create `src/env.ts` — read & validate env at boot (throw if missing)
- [x] **0.7** Add path alias `@/` → `src/` in `tsconfig.app.json` and `vite.config.ts`
- [x] **0.8** Create `src/theme/ThemeProvider.tsx` — light/dark toggle + localStorage persistence, drives `data-theme` on `<html>`
- [x] **0.9** Create `src/lib/cn.ts` — `cn(...args)` className join helper
- [x] **0.10** Create `src/hooks/useIntersect.ts` — one-shot IntersectionObserver hook
- [x] **0.11** Create `src/hooks/useCountUp.ts` — count-up animation hook (respects reduced motion)
- [x] **0.12** Create `src/hooks/useReducedMotion.ts` — `prefers-reduced-motion` boolean

**Acceptance:** `pnpm -F tendahq dev` boots, `<html data-theme>` toggles, fonts load, type atoms render at correct sizes.

---

## Phase 1 · Data layer

Files: `src/app-info.ts`, `src/data/*.ts`, `src/api/platform.ts`

- [x] **1.1** Refactor `src/app-info.ts` to keep ONLY app-wide facts:
  - name, tagline, description, apkUrl, appStoreUrl, playStoreUrl
  - Social URLs (twitter, whatsapp, discord, github, telegram)
  - Version string (e.g. `v0.2.0-devnet`)
  - Build location (`Lagos`)
  - Country count claim (decision needed — 14? confirm with product)
  - **Remove** `stats`, `howItWorksEarn`, `howItWorksPost` arrays — those move to section content files
- [x] **1.2** Create `src/data/stats.ts`:
  - `LIVE_STATS_KEYS` — typed list of fields populated from API
  - `PLACEHOLDER_STATS` — every wireframe number flagged `placeholder: true`
  - One exported helper `getStat(key)` so the placeholder badge renders consistently
- [x] **1.3** Create `src/data/currencies.ts` — re-export 8 fiat currencies with `{ code, name, flag, symbol }`
- [x] **1.4** Create `src/data/categories.ts` — 5 gig categories with `{ id, label, icon, tone }` (icon = Lucide name; tone = CSS var name)
- [x] **1.5** Create `src/data/mock-feed.ts`:
  - `MOCK_LIVE_ROWS` — for §05 ticker (drawn from `05-live-ticker.html`)
  - `MOCK_GIG_CARDS` — for §03 left card (drawn from `home.html`)
  - `MOCK_OFFER_CARDS` — for §03 right card (drawn from `exchange-detail.html`)
  - All exported `as const` so types stay narrow
- [x] **1.6** Create `src/api/platform.ts`:
  - [x] **1.6.1** `fetchPlatformConfig()` → typed `{ fee_bps, seeker_fee_bps, grace_period_seconds }`
  - [x] **1.6.2** `fetchExchangeRates()` → typed `{ rates: Record<CurrencyCode, number>, fetched_at: number }`
  - [x] **1.6.3** Module-level cache + 5-min TTL (mirror server cache)
  - [x] **1.6.4** AbortController on unmount
- [x] **1.7** Create `src/api/usePlatformConfig.ts` and `src/api/useExchangeRates.ts` — React hooks consuming the cached fetchers, return `{ data, loading, error }`

**Acceptance:** open dev tools, `usePlatformConfig()` returns `{ fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 86400 }`. Cache survives re-render. Aborted on unmount.

---

## Phase 2 · Reusable primitives

Files: `src/components/ui/*.tsx`, `src/components/product/*.tsx`

- [x] **2.1** Refactor `Button.tsx`:
  - [ ] Add `accent` variant (orange `--accent.primary`)
  - [ ] Add `size: 'xl'` (60h, used by hero CTAs)
  - [ ] Verify all variants under both light and dark themes
- [x] **2.2** Create `Eyebrow.tsx` — mono-uppercase, optional leading dot (live, accent), props `{ tone?, dot? }`
- [x] **2.3** Create `Pill.tsx` — covers status pills, payment-method chips, currency chips. Props `{ tone, size, dot? }`
- [x] **2.4** Create `LiveDot.tsx` — green pulsing dot (used in nav, footer, ticker, hero eyebrow)
- [x] **2.5** Create `SectionShell.tsx`:
  - Props: `{ tone: 'dark' | 'light', maxWidth?, padY? }`
  - Theme map per `IMPLEMENTATION.md` §3.4: hero/trust/products/escrow/ticker dark · why light · coverage dark · audiences light · faq/cta/footer dark
- [x] **2.6** Create `Stat.tsx` — mono-large number + caption. Optional `countUp` boolean. Optional `placeholder` boolean → renders identically but adds `data-placeholder="true"` attribute
- [x] **2.7** Create `MarqueeRow.tsx`:
  - [ ] Direction `'left' | 'right'`
  - [ ] Speed in seconds (per loop)
  - [ ] `pauseOnHover`
  - [ ] Edge-mask gradient
  - [ ] Static fallback under `prefers-reduced-motion`
- [x] **2.8** Create `Accordion.tsx` — single-open, controlled or uncontrolled, ARIA-correct (`aria-expanded`, `aria-controls`), 200ms ease-out height transition
- [x] **2.9** Create `SegmentedControl.tsx` — used by §04 Gig⇄Exchange toggle. Generic over option values
- [x] **2.10** Create `Placeholder.tsx` — wraps any value flagged `placeholder: true`, adds dev-only outline + tooltip. Production: invisible
- [x] **2.11** Build product mock cards under `src/components/product/`:
  - [x] **2.11.1** `MockGigCard.tsx` — port from `Tenda V2/home.html` price-leading variant
  - [x] **2.11.2** `MockOfferCard.tsx` — port from `Tenda V2/exchange-detail.html` (OfferSummaryCard)
  - [x] **2.11.3** `MockEscrowCard.tsx` — hero centerpiece, 3-state on-mount transition (pending → funding → locked); reduced-motion = locked state only
  - [x] **2.11.4** `AndroidFrame.tsx` — port from `Tenda V2/landing/android-frame.jsx`

**Acceptance:** every primitive renders in isolation (Storybook optional), passes accessibility audit (focus-ring visible, ARIA on accordion, alt text on icons).

---

## Phase 3 · Sections (in spine order)

Each section folder structure:
```
sections/<name>/
├─ <Name>.tsx          ← composition only
├─ <Internal>.tsx      ← internal pieces, optional
└─ content.ts          ← all copy, top-level constants
```

**Rule:** zero raw string literals in JSX beyond template binding. All copy in `content.ts`.

References per section:
- Section file: `Tenda V2/landing/sections/0X-*.html`
- Brief section: `LANDING_DESIGN_BRIEF.md` §6.X
- Designer notes: `IMPLEMENTATION.md` §4 (copy decks)

### §00 Navbar
- [x] **3.0.1** Restyle existing `components/layout/Navbar.tsx` to glass-on-scroll over new tokens
- [x] **3.0.2** Add 4-link nav: `Gigs · Exchange · How it works · For who · FAQ` (verify final list with brief §6.0)
- [x] **3.0.3** Add theme toggle button (sun/moon)
- [x] **3.0.4** Mobile sheet: full-screen, sectioned list, ChevronRight, sticky download CTA

### §01 Hero (`sections/hero/`)
- [x] **3.1.1** `content.ts` — eyebrow, h1Lines, subtitle, CTAs, trustLine
- [x] **3.1.2** `Hero.tsx` — composes shell, copy, escrow card, currency marquee
- [x] **3.1.3** `HeroEscrowCard.tsx` — uses `MockEscrowCard`, places at perspective tilt
- [x] **3.1.4** `CurrencyMarquee.tsx` — uses `useExchangeRates()` + `MarqueeRow`. Falls back to flag+code if rate missing (e.g. GHS)
- [x] **3.1.5** Verify count-up animation runs once on mount; reduced-motion skips

### §02 Trust strip (`sections/trust-strip/`)
- [x] **3.2.1** `content.ts` — 4 stat definitions, 24h volume tagline
- [x] **3.2.2** `TrustStrip.tsx` — uses `Stat` × 4, `Placeholder` wrapper for unverified numbers, `usePlatformConfig` for the fee chip
- [x] **3.2.3** Vertical hairlines between cells via `border.subtle`

### §03 Two products (`sections/two-products/`)
- [x] **3.3.1** `content.ts` — Gigs panel + Exchange panel copy
- [x] **3.3.2** `TwoProducts.tsx` — left = `MockGigCard` × 3 stack, right = `MockOfferCard` × 1 hero
- [x] **3.3.3** Mirror split layout (Gigs brand-blue accent · Exchange green accent)

### §04 How escrow works (`sections/how-escrow-works/`)
- [x] **3.4.1** `content.ts` — `STEPS_GIG`, `STEPS_EXCHANGE` arrays
- [x] **3.4.2** `HowEscrowWorks.tsx` — `SegmentedControl` toggles which array renders
- [x] **3.4.3** Animated brand dot travels along hairline path on viewport-enter (one pass)
- [x] **3.4.4** Each step card has hero number background, H3 title, body

### §05 Live ticker (`sections/live-ticker/`)
- [x] **3.5.1** `content.ts` — section heading + caption
- [x] **3.5.2** `LiveTicker.tsx` — two `MarqueeRow`s opposite directions
- [x] **3.5.3** Top row uses `MOCK_LIVE_ROWS.gigs`, bottom row uses `MOCK_LIVE_ROWS.exchange`
- [x] **3.5.4** "What's live right now" header above with `LiveDot`

### §06 Why Tenda (`sections/why-tenda/`)
- [x] **3.6.1** `content.ts` — 4 pillars (Settlement, Fees, Cash-out, Disputes)
- [x] **3.6.2** `WhyTenda.tsx` — uses `usePlatformConfig` for fee pillar (`fee_bps / 100` + `seeker_fee_bps / 100`)
- [x] **3.6.3** **Light mode** section (interrupts dark spine — verify `tone="light"`)
- [x] **3.6.4** Numbers wrapped in `Placeholder` where unverified (settlement time, dispute rate)

### §07 Coverage (`sections/coverage/`)
- [x] **3.7.1** `content.ts` — heading, currency tile data
- [x] **3.7.2** `Coverage.tsx` — world-map SVG (static for v1) + flag grid pulled from `data/currencies.ts`
- [x] **3.7.3** Pings stubbed at fixed coords; flagged via `data-placeholder` so M77/M78 drives them later

### §08 Three audiences (`sections/three-audiences/`)
- [ ] **3.8.1** `content.ts` — Workers, Posters, Traders columns (4 list items each + CTA)
- [ ] **3.8.2** `ThreeAudiences.tsx` — 3 columns at `lg+`, stacks below
- [ ] **3.8.3** **Light mode** section
- [ ] **3.8.4** Each column has its own CTA variant (brand · outline · accent)

### §09 FAQ (`sections/faq/`)
- [ ] **3.9.1** `content.ts` — 8 Q&A items
- [ ] **3.9.2** `FAQ.tsx` — uses `Accordion`, single-open, **all collapsed by default in production** (per IMPLEMENTATION.md §7)
- [ ] **3.9.3** Verify Q5 currency answer matches `data/currencies.ts` list
- [ ] **3.9.4** Verify Q3 fee answer matches live `fee_bps`/`seeker_fee_bps`

### §10 Final CTA (`sections/final-cta/`)
- [ ] **3.10.1** `content.ts` — h1Lines, subtitle, button labels, qrFallback, receipts
- [ ] **3.10.2** `FinalCTA.tsx` — composes shell + Android frame + waitlist input
- [ ] **3.10.3** `WaitlistForm.tsx` — email field + Submit; mailto fallback for v1, flagged for M79
- [ ] **3.10.4** `AndroidFrame` shows static screenshot of `Tenda V2/home.html`
- [ ] **3.10.5** Receipts pulled live from `usePlatformConfig` where possible

### §11 Footer (`sections/footer/`)
- [ ] **3.11.1** `content.ts` — wordmark, tag, sitemap groups, legal foot
- [ ] **3.11.2** `Footer.tsx` — replaces existing `components/layout/Footer.tsx`
- [ ] **3.11.3** Live status strip uses `useExchangeRates()` for `fetched_at` and one spotlight rate
- [ ] **3.11.4** Volume number flagged placeholder (M75)
- [ ] **3.11.5** Socials grid from `app-info.ts`
- [ ] **3.11.6** Legal foot copy frozen pending product/legal review (M85 — open question from designer)

---

## Phase 4 · Composition

Files: `src/App.tsx`, `src/components/layout/StickyMobileCTA.tsx`

- [ ] **4.1** Update `App.tsx`:
  - [ ] Replace section imports with new ones
  - [ ] Remove `Problem` (rolled into TwoProducts)
  - [ ] Render in spine order: Hero → TrustStrip → TwoProducts → HowEscrowWorks → LiveTicker → WhyTenda → Coverage → ThreeAudiences → FAQ → FinalCTA → Footer
- [ ] **4.2** Create `StickyMobileCTA.tsx` — bottom-pinned 56h bar, hides when `<FinalCTA>` is in view
- [ ] **4.3** Delete or archive legacy section files (`Problem.tsx`, `Stats.tsx`, `WhoItsFor.tsx`, `WhyTenda.tsx`, `HowItWorks.tsx`, `Hero.tsx`, `Download.tsx`) — move to `src/legacy/` if we want to keep history, otherwise delete
- [ ] **4.4** Verify no stale imports remain (`pnpm -F tendahq build` should fail if so)

---

## Phase 5 · Polish & QA

- [ ] **5.1** Motion pass:
  - [ ] Section reveals via IntersectionObserver + `data-visible` class
  - [ ] Count-ups via `useCountUp`
  - [ ] No infinite animations except: marquees + live-dot pulse
- [ ] **5.2** `prefers-reduced-motion` audit — every animated element falls back gracefully
- [ ] **5.3** Theme toggle — manually verify every section under both themes
- [ ] **5.4** Responsive audit — verify 360, 390, 640, 768, 1024, 1280, 1440 breakpoints
- [ ] **5.5** Type-check — `pnpm -F tendahq build` clean
- [ ] **5.6** Lint — `pnpm -F tendahq lint` clean
- [ ] **5.7** Lighthouse — Performance ≥ 90, Accessibility ≥ 95, no CLS on hero
- [ ] **5.8** Font subset / preload — only ship variable fonts that are used; preload the hero font
- [ ] **5.9** Image audit — every screenshot lazy-loaded except hero card
- [ ] **5.10** Dev-build smoke test — confirm every API call hits `127.0.0.1:3000` and renders correctly with both endpoints up
- [ ] **5.11** Offline test — confirm placeholder fallbacks render when API is unreachable
- [ ] **5.12** Cross-browser — Chrome, Firefox, Safari, mobile Safari, Chrome Android

---

## Phase 6 · Documentation

- [ ] **6.1** Update `apps/tendahq/README.md`:
  - Document `VITE_API_BASE_URL` env var
  - Document folder structure
  - Document section conventions (content.ts pattern, no inline strings)
- [ ] **6.2** Append M75–M84 follow-ups to `open_issues.md` under "Landing v2 — backend dependencies"
- [ ] **6.3** Update `IMPLEMENTATION.md` § "Production conversion checklist" with checkboxes marking what's done
- [ ] **6.4** Add `.env.example` row to root README if it tracks env vars
- [ ] **6.5** Document fee model resolution (M80 closed) in commit / PR description with link to `/v1/platform/config` response

---

## Open decisions (block specific tasks)

| ID | Decision | Blocks | Owner |
|---|---|---|---|
| D1 | Country count claim (`14` countries used in IMPLEMENTATION §4 hero, footer) — confirm or replace | 3.1, 3.11 | product |
| D2 | iOS waitlist endpoint vs. mailto for v1 | 3.10.3 | product |
| D3 | Legal foot copy in §11 (currently flagged PROPOSE) | 3.11.6 | legal |
| D4 | Production `VITE_API_BASE_URL` (api.tenda.so?) | 0.4, 5.10 | infra |
| D5 | Replace placeholder QR (`tenda.so/get`) — real domain? | 3.10 | product |
| D6 | Are Google Play / App Store listings ready? Or keep APK-only CTA? | 3.10 | product |
| D7 | Are workers really fee-free in marketing copy, or do we surface 1% honestly? | 3.6.2, 3.9.4 | product |
| D8 | GHS missing from `/v1/platform/exchange-rates` — fix in shared backend, or hide in UI? | 3.1.4 | infra |

---

## Status legend

- `[ ]` open
- `[~]` in progress
- `[x]` complete
- `[!]` blocked / waiting on a decision
- `[-]` skipped — append reason in parentheses

When closing a task, link to the commit SHA in the line if practical:
```
- [x] **3.1.1** `content.ts` — eyebrow, h1Lines, subtitle, CTAs, trustLine  (a3f2c91)
```

---

## Quick navigation

- Foundations → [Phase 0](#phase-0--foundations)
- Data layer → [Phase 1](#phase-1--data-layer)
- Primitives → [Phase 2](#phase-2--reusable-primitives)
- Sections → [Phase 3](#phase-3--sections-in-spine-order)
- Composition → [Phase 4](#phase-4--composition)
- QA → [Phase 5](#phase-5--polish--qa)
- Docs → [Phase 6](#phase-6--documentation)

End of tracker.
