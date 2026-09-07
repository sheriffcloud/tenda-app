# tendahq

Landing page for [tendahq.com](https://tendahq.com).

Vite · React 19 · TypeScript · Tailwind CSS v4 · React Router · Lucide

## Setup

```bash
pnpm install
pnpm dev       # http://localhost:5173
```

Two variables are required at build and dev time, and `src/env.ts` throws at
import without them (a blank page, not a warning): `VITE_API_BASE_URL` (the
Fastify API the health chip and fee figures read) and `VITE_WEB_APP_URL` (where
"Open the web app" points). `.env.example` documents both; `.env.development`
points at the local server and web app and is loaded in dev mode only, so a
production build must be given them explicitly.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | `tsc -b` then the production build → `dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm lint` | eslint |
| `pnpm test` / `pnpm test:coverage` | vitest, with the coverage gate |
| `pnpm gen:tokens` | Regenerate `src/styles/tokens.css` from mobile's tokens |
| `pnpm gen:tokens:check` | Fail if that file is stale (the CI drift gate) |

## Routes

`/` (landing) · `/terms` · `/privacy`

## Content layer

All editorial content lives in `src/content/` — edit there, not in components.
Most of it is DERIVED from `@tenda/shared`, so a chain, category, currency or
market added there appears on the landing with no edit here:

| File | Owns |
|---|---|
| `app-info.ts` | Name, taglines, distribution URLs, socials, version, chain identity |
| `chains.ts` / `chain-status.ts` | Chain registry derived from the shared `CHAIN_MANIFEST` (mainnet entries) plus marketing display extras; which chains the escrow is actually DEPLOYED on, declared per manifest entry |
| `categories.ts` / `currencies.ts` / `markets.ts` / `fees.ts` | Gig categories, display currencies, fiat corridors and fee facts, each derived from the shared registry the server validates against |
| `tasks.ts` / `trades.ts` | Example gigs (the tasks ticker, the app-screen and product-sheet mock-ups) / example exchange corridors (the product sheet) |
| `escrow-example.ts` | The one example escrow the hero receipt and the phone's escrow screen both draw |
| `features/` | The onboarding rail: gas-policy cards derived from the manifest, plus the hand-written agent, wallet and on-ramp cards |
| `ecosystems.ts` / `agent-flow.ts` | Per-chain proof points / the hire loop's two lanes as data |

Per-section prose stays in each section's `content.ts`
(`src/components/sections/<name>/content.ts`). No raw copy strings in JSX.

`@tenda/shared` subpaths are aliased to the package's TS **source** in
`vite.config.ts` + `tsconfig.app.json` (linked workspace packages skip Vite's
CJS interop, and bundling source avoids a build-order dependency).

## Theming

Design tokens are GENERATED into `src/styles/tokens.css` from
`apps/mobile/theme/tokens.ts` — every colour as one `light-dark(light, dark)`
pair, plus radius, spacing, shadows, motion, and mobile's type styles as one
`type-<name>` utility each — by web's generator: `pnpm gen:tokens` rewrites
it, `pnpm gen:tokens:check` is the CI drift gate, and the file is never edited
by hand. `src/styles/type.css` maps the landing's class names onto those
utilities (`.label { @apply type-label; }`), keeping by hand only the
viewport-scaled display sizes and the lede mobile has no style for;
`src/__tests__/type-atoms.test.ts` fails if a class with an exact mobile twin
restates its numbers. `src/styles/base.css` keeps what mobile
has no source for: the web font stacks, the theme stamps that pick a side of
each pair, and the element resets. The generated `--radius-xs…xl` share
Tailwind's radius namespace on purpose, so `rounded-md` is mobile's 16px here
as it is in web; reach for a token (`rounded-[var(--radius-xs)]`) rather than
the default scale.

The page renders in ONE theme: sections vary only by `surface` tint
(`base`/`alt`), never by pinning their own theme (the app-screen mock-ups pin
`color-scheme: light` because a phone does not invert with the page). Ink and
paper do the work; brand blue is the one filled button, the headline period
and the live pip; green is a live dot or a settled payout; the category tones
colour gig categories only; per-chain brand colours appear only as
micro-glyphs; accent amber is absent (the generator's tendahq target omits the
group). Fonts: Space Grotesk (display), Manrope (body), JetBrains Mono
(numerics and eyebrows), mobile's three faces as variable web fonts.
