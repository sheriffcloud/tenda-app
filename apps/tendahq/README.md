# tendahq

Landing page for [tendahq.com](https://tendahq.com).

## Stack

Vite · React 19 · TypeScript · Tailwind CSS v4 · React Router · Lucide

## Setup

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # production build → dist/
pnpm preview   # preview production build locally
```

`VITE_API_BASE_URL` is required at build/dev time (see `.env.example`;
`.env.development` points at the local server).

## Routes

| Path | Description |
|---|---|
| `/` | Landing page |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |

## Content layer

All editorial content lives in `src/content/` — edit there, not in components:

| File | Owns |
|---|---|
| `app-info.ts` | Name, taglines, distribution URLs, socials, version, chain identity |
| `chains.ts` | Chain registry **derived from `@tenda/shared` CHAIN_MANIFEST** (mainnet entries) + marketing display extras. A chain added to the manifest appears here automatically |
| `tasks.ts` | 20+ example gigs (hero TaskDeck + tasks wall) — add rows to showcase more |
| `trades.ts` | Example P2P corridors (TradeDeck): asset + chain → fiat + payout rail |
| `features.ts` | Onboarding-rail cards (gas story per chain, wallet support) |
| `ecosystems.ts` | Per-chain integration proof points + grants call-out |

Per-section prose stays in each section's `content.ts`
(`src/components/sections/<name>/content.ts`). No raw copy strings in JSX.

`@tenda/shared/chains` is aliased to the package's TS **source** in
`vite.config.ts` + `tsconfig.app.json` (linked workspace packages skip Vite's
CJS interop, and bundling source avoids a build-order dependency).

## Theming

Design tokens live in `src/index.css` — a **dark-first, blue + neutral**
system built around the logo (deep navy wordmark, royal-blue period). Dark is
the default theme; the toggle stores an explicit choice. The whole page
renders in ONE theme: sections vary only by `surface` tint (`base`/`alt`),
never by pinning their own theme.

Colour discipline: brand blue and a lighter companion blue do all decorative
work; green/orange/red exist only as semantic feedback; per-chain brand
colours appear only as micro-dots. Fonts: Outfit (display), Instrument Sans
(body), JetBrains Mono (numeric). The header/footer carry the wordmark image
via `BrandLogo` (theme-aware, `src/assets/tenda-wordmark*.png`).
