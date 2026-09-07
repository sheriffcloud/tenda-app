# Tenda Landing — Wireframe Implementation Doc

> **Audience:** the engineering / design agent picking this up.
> **Scope:** what's in `landing/`, why it's shaped that way, how to turn it into a real landing page.
> **Status:** wireframe v1 · 12 sections · desktop 1440 + mobile 390 · all annotated.

---

## 1. What you're looking at

Two top-level deliverables, both at `landing/`:

| File | Purpose |
|---|---|
| `landing/landing.html` | **Stitched composition.** All 12 sections in one scrollable page. Desktop / mobile toggle in the top bar. Left rail tracks the active section as the user scrolls. |
| `landing/canvas.html` | **Atomized canvas.** Every section frame side-by-side on a pan/zoom canvas with post-it annotations. Synthesis frame at top embeds `landing.html` so reviewers can flip between stitched and atomized views. |

Both files are **iframe-driven**: each section lives in its own self-contained file under `landing/sections/`, and the two top-level files compose them by injecting CSS that hides the wireframe canvas chrome (header / labels / yellow post-it notes) and reveals the targeted `.frame-wrap`. This is deliberate — see [§5 Architecture](#5-architecture).

---

## 2. Section inventory

| § | File | What it is | Heart of the section |
|---|---|---|---|
| 00 | (in `01-hero.html`, frames 0–1) | Navbar | Glass top bar, brand + 4 nav links + Sign in / Get app. Mobile sheet. |
| 01 | `01-hero-final.html` (D) · `01-hero.html` idx 3 (M) | Hero · the opener | Big claim + 3-state escrow card stack (back / mid / front) + currency marquee. |
| 02 | `02-trust-strip.html` | Proof band | 24h running volume + 4 receipt counters. |
| 03 | `03-two-products.html` | Two products | Gigs ⇄ Trade split panel. One real card from each side. |
| 04 | `04-how-escrow-works.html` | Escrow flow | Post → Lock → Deliver → Release. Numbered steps, explicit data flow. |
| 05 | `05-live-ticker.html` | Live ticker | Bloomberg-style running settlement feed. |
| 06 | `06-why-tenda.html` | Why Tenda · 4 pillars | Settlement · Fees · Cash-out · Disputes. One number + one sentence each. |
| 07 | `07-coverage.html` | Coverage | World map of live settlement pings. |
| 08 | `08-three-audiences.html` | Three audiences | Workers · Posters · Traders, three columns, three CTAs. |
| 09 | `09-faq.html` | FAQ | 8 expanded questions. **Wireframe shows all open**; production should collapse by default. |
| 10 | `10-final-cta.html` | Final CTA | Oversized closer headline + Android phone frame containing real Tenda app screen. |
| 11 | `11-footer.html` | Footer · system colophon | Wordmark band, sitemap, live status strip, region/FX, legal foot. |

Alternates kept on disk for reference, **not used in the composition**:
- `01-hero.html` — early light hero exploration (still used for nav frames + mobile hero)
- `01-hero-dark-explorations.html` — three rejected dark hero directions (A/B/C)
- `04-how-escrow-works-light.html` — light variant; dark version shipped
- `07-coverage-v1-schematic.html` — earlier schematic map; v2 (`07-coverage.html`) shipped

---

## 3. Design system (what's defined, what's borrowed)

### 3.1 Type stack
Defined in `landing/landing.css` under `:root`:

```css
--display: 'Space Grotesk', system-ui, sans-serif;   /* hero, h1–h3 */
--body:    'Manrope', system-ui, sans-serif;          /* body, UI */
--mono:    'JetBrains Mono', ui-monospace, monospace; /* labels, numbers, eyebrows */
```

**Type atoms** (also in `landing.css`): `.h-hero` (76px), `.h-hero-mobile` (44px), `.h1` (44px), `.h2` (32px), `.h3` (22px), `.body-lg` (18px), `.body` (15px), `.body-sm` (13px), `.eyebrow` (12px uppercase), `.caption` (11px), `.mono-large` (40px), `.mono-mid` (22px), `.mono-sm` (12px). **Use these names** when promoting sections to production CSS classes — the section files use inline styles for speed but the names are the contract.

### 3.2 Brand color
- `--brand: #2E5BD6` (the deep blue from the app — primary actions on **light** sections only)
- `--accent: #3ACB8E` (the green that runs across the dark sections — escrow active, live data, the period in `tenda.`)
- `--ok: #1F9D6B` (light-mode success; in-app green)
- Dark spine: `#07090F` → `#0A0C12` for backgrounds; `#F4F2ED` for primary ink on dark; `#B6BAC5` / `#8A8E98` / `#6F7488` for the dark-mode neutral ramp.

The **green period** in `tenda.` (and the green pulsing dot used for "live") is a recurring brand mark across the whole page — auth, status, footer wordmark, ticker, hero. Keep it; remove it from one place and the system loses cohesion.

### 3.3 Category tones (carried over from the product)
Defined under `:root` in `landing.css` and used wherever a category badge appears:

| Token | Hex | Used for |
|---|---|---|
| `--cat-delivery` | `#3B82F6` | Delivery |
| `--cat-photo` | `#8B5CF6` | Photo / Digital |
| `--cat-errand` | `#D98722` | Errands |
| `--cat-service` | `#1F9D6B` | Services |
| `--cat-digital` | `#E0579D` | Digital (alt) |

### 3.4 Light vs. dark · per-section
The page has a deliberate **dark spine** punctuated by light interludes:

| § | Mode | Reason |
|---|---|---|
| 00 nav | light glass | First touch — feels open, scrollable. |
| 01 hero | **dark** | The product is escrow; the brand image lives in dark. |
| 02 trust | dark | Continues the spine; numbers feel weightier on dark. |
| 03 products | dark | Mirror split visually. |
| 04 escrow | dark | Diagram reads cleaner on dark. |
| 05 ticker | dark | Bloomberg-style is dark-native. |
| 06 why | **light** | Pillar grid gets a breath of light air. |
| 07 coverage | dark | Map glow + green pings need black background. |
| 08 audiences | **light** | Three-column read needs light to feel approachable. |
| 09 FAQ | dark | Returns to spine — quiet, dense reading mode. |
| 10 CTA | dark | The closer — same dark as hero, page bookends. |
| 11 footer | dark | System colophon. |

If you change one section's mode, audit the sections on either side — the rhythm matters more than any single section.

### 3.5 Spacing
Sections share a consistent **vertical rhythm** but each defines its own pad explicitly. Common values:
- Section padding (desktop): `96px–120px` top/bottom, `80px` horizontal.
- Section padding (mobile): `64px–80px` top/bottom, `20px` horizontal.
- Section content max-width: `1280px` centered.
- Vertical gap between major elements within a section: `48–80px`.
- Hairline rules: `rgba(255,255,255,0.06–0.10)` on dark, `rgba(0,0,0,0.06–0.10)` on light.

---

## 4. Copy decks (verbatim, by section)

These are the strings shipped in the wireframe. Keep them as-is unless a section note explicitly flags `PROPOSE`.

### §01 Hero
- Eyebrow: `● LIVE · 12,847 GIGS THIS WEEK`
- H1: `Work. Earn.` / `Settled in 1.7 seconds.`
- Sub: "The contract layer for everyday work. Post a gig, lock the funds, get the job done — Tenda releases payment the moment delivery is confirmed. No invoices. No 30-day waits. No 'we'll get back to you Tuesday.'"
- Primary CTA: `Get the app`
- Secondary CTA: `See how it works`
- Trust line: `12,847 gigs settled · 14 countries · 0.4% disputes`

### §02 Trust strip
- `$3.42M settled · 24h`
- `8,407 gigs · 1.7s avg · 0.4% disputes · 14 countries`
- All counters animate up on intersect.

### §06 Why Tenda · 4 pillars
1. **Settlement · 1.7s avg** — funds release the second delivery is confirmed.
2. **Fees · 1.5% poster only** — workers keep 100% of payout.
3. **Cash-out · NGN, KES, GHS, ZAR + USDC/USDT** — to local bank or self-custody wallet.
4. **Disputes · 0.4%** — protocol arbitration, escrow holds the funds in the meantime.

### §10 Final CTA
- H1: `Stop waiting.` / `Start earning.` / `Or hiring. Or trading.`
- Sub: "The contract is live. The wallet's in your pocket. Whatever side you're on — workers, posters, traders — the next gig is one tap away. No invoice. No PayPal. No 'we'll get back to you on Tuesday.'"
- Buttons: `Google Play` · `App Store`
- QR fallback: `tenda.so/get`
- Receipts: `1.7 sec` · `1.5% poster only` · `0.4% disputes`

### §11 Footer
- Wordmark: `tenda.` (period in `--accent`)
- Tag: "Built in **Lagos** · running across **14 countries** · settled on-chain since day one."
- Sitemap: `00 About · 01 Product · 02 Workers · 03 Posters · 04 Resources`
- Live volume (24h): `$3.42M · ↑ 11.3% vs. 7d avg · 8,407 settlements`
- Legal foot: "© 2026 Tenda Ltd. RC 1847299. Tenda is a software interface; payments are routed via licensed partners. Crypto products may not be available in all regions."

> **Numbers strategy.** The `1.7s` / `1.5%` / `0.4%` triple is the hero proof. It appears in **§01 hero trust line, §02 trust strip, §06 pillars, §10 final CTA receipts, §11 footer status**. Repetition is conviction — do not vary the numbers across sections; if one moves, all move.

---

## 5. Architecture

### 5.1 The composition trick
Each section file (`landing/sections/0X-*.html`) is **a self-contained wireframe canvas**: it has its own `<head>`, `<body>`, fonts, inline `<style>`, and renders the section twice (desktop + mobile) on a cream `#e8e5de` art-direction background, with a yellow post-it annotation grid below.

When `landing.html` and `canvas.html` compose these sections, they:

1. Load the section file in an iframe.
2. Inject this CSS into the iframe's `<head>` to strip canvas chrome:
   ```css
   html, body { background: transparent; padding: 0; margin: 0; }
   .canvas-header, .notes, .frame-row-title, .frame-label { display: none; }
   .frame-w, .frame-mw, .frame { border-radius: 0; box-shadow: none; width: 100%; }
   ```
3. Imperatively walk `document.querySelectorAll('.frame-wrap')` and `display: flex` only the targeted index (0 = desktop, 1 = mobile in most files; see `SECTIONS` array in `canvas.html` for per-section overrides — `01-hero.html` mobile is at index `3`).
4. Auto-fit the iframe height by measuring the visible `.frame-wrap`'s bounding rect.

> **Why iframes and not server-side stitching?** Each section's CSS is intentionally siloed (lots of inline `<style>` blocks with section-scoped class names). Stitching them into one DOM would force a global rename pass on every section's classes — high cost, high regression risk for a wireframe. The iframe approach lets sections evolve independently.

> **Production note.** When porting to a real codebase, **don't ship iframes**. Convert each section file's `<style>` block into a scoped CSS module (or styled-components) and the markup into a React component. The naming conventions in `landing.css` (`.h-hero`, `.body-lg`, `.pill`, etc.) are the migration contract — section-internal class names are throwaway.

### 5.2 File map
```
landing/
├─ landing.html              ← stitched composition, desktop/mobile toggle
├─ canvas.html               ← atomized pan/zoom canvas, all 24 frames
├─ landing.css               ← shared tokens + atoms
├─ design-canvas.jsx         ← starter component (don't edit; canvas.html consumes it)
├─ android-frame.jsx         ← starter component (consumed by §10)
├─ IMPLEMENTATION.md         ← this file
└─ sections/
   ├─ 01-hero.html               (light hero + nav frames; mobile hero used by composer)
   ├─ 01-hero-final.html         (dark canonical hero — shipped)
   ├─ 01-hero-dark-explorations.html  (3 rejected directions, kept for record)
   ├─ 02-trust-strip.html
   ├─ 03-two-products.html
   ├─ 04-how-escrow-works.html       (dark — shipped)
   ├─ 04-how-escrow-works-light.html (light alt — not used)
   ├─ 05-live-ticker.html
   ├─ 06-why-tenda.html
   ├─ 07-coverage.html               (v2 map — shipped)
   ├─ 07-coverage-v1-schematic.html  (v1 schematic — not used)
   ├─ 08-three-audiences.html
   ├─ 09-faq.html
   ├─ 10-final-cta.html
   └─ 11-footer.html
```

Outside `landing/` (existing app screens — **don't touch when iterating on the landing**): `auth.html`, `home.html`, `messages*.html`, `wallet.html`, `exchange*.html`, `gig*.html`, `profile.html`, `settings.html`, `support.html`, `modals.html`, `create-*.html`, `update-profile.html`, `my-gigs.html`, `shared.css`. These are governed by the separate `CHANGELOG.md` at root.

---

## 6. Build sequence (how this was assembled)

For an agent reproducing or extending the work:

1. **Set tokens first.** `landing/landing.css` defines fonts + atoms. Touch this before any section.
2. **Build sections in order, dark sections first.** The dark spine (§01–05, §07, §09–11) shares colors and rhythm; building them together caught drift early.
3. **Each section is two frames**: desktop `frame-w` (1440) + mobile `frame-mw` (390), both inside one `frame-wrap`. Mobile frames live in the same file as their desktop counterpart.
4. **Annotations live below the frames** in a `.notes` grid (3-column post-it style). Categories: `note` (yellow, default), `note.motion` (green, motion specs), `note.spacing` (blue, spacing specs).
5. **Compose into `landing.html` only after every section file renders cleanly standalone.** The composer is mechanical — it does not fix broken sections.
6. **Build `canvas.html` last.** It consumes the same section files plus `landing.html` itself as a synthesis frame.

---

## 7. Production conversion checklist

When promoting this wireframe to production, in this order:

1. **Strip iframes.** Each section becomes a React component (`<Hero />`, `<TrustStrip />`, `<TwoProducts />`, etc.) under `app/landing/sections/`.
2. **Hoist tokens.** Move `--display`, `--body`, `--mono`, `--brand`, `--accent`, category tones, and shadow vars from `landing.css` into the global theme.
3. **Consolidate atoms.** `.btn`, `.pill`, `.tag-pill`, `.eyebrow`, `.mono-*`, `.h-hero`, etc. become real component primitives. Section-internal class names (e.g. `.cta-h`, `.ft-mark`, `.ta-balance`) get scoped to their component or replaced with the shared atoms.
4. **Wire live data.** Anywhere a number appears (`$3.42M`, `1.7s`, `8,407`, `↑ 11.3%`, the live ticker rows, the coverage pings) — these are stubbed strings in the wireframe. Production needs:
   - 24h volume + delta (single endpoint; reused 4×)
   - settlement-time rolling average
   - dispute-rate rolling average
   - settlement count
   - currency FX strip (footer + hero marquee)
   - live settlement feed (§05 ticker + §07 map)
5. **Production state for §09 FAQ:** the wireframe shows all answers expanded. Production should collapse all by default, one-open-at-a-time accordion, smooth height transition (`200ms ease-out`).
6. **Speaker-text scrub pass.** Run product/legal over the §11 legal foot. The PROPOSE flag here is intentional.
7. **Asset pass.** Replace the placeholder Google Play / App Store SVGs in `10-final-cta.html` with the official badge assets. The QR code in §10 is also a stylized wireframe — generate a real QR pointing at `tenda.so/get`.
8. **Motion spec pass.** Each section's `.note.motion` post-it documents the intended motion. Implement with Framer Motion or CSS where listed: counter-up on intersect (§02, §06, §11), pulse loops (live dots, every section), card stack tilt-in (§01), ticker marquees (§01, §05), map ping pulse (§07), eyebrow horizontal sweep (§11 hairline).

---

## 8. Decisions log

What we considered and rejected, so the next agent doesn't relitigate:

| Decision | Considered | Chose | Why |
|---|---|---|---|
| **Hero direction** | A: marketplace card grid, B: Bloomberg terminal, C: blown-up offer card | **D: card stack with story** (3 stacked escrow cards: pending → funding → locked) | Tells the whole product story before the user reads. A/B/C all relied on chrome; D relies on narrative. Other directions kept in `01-hero-dark-explorations.html`. |
| **Trust strip variant** | V1 proof band (numbers in a row) vs. V2 restating hero claim | **V1** | V2 just paraphrased the hero. V1 adds new information (4 specific receipts) and earns its slot. |
| **Coverage map** | V1 schematic (geometric world map) vs. V2 photographic-feel | **V2** | Schematic felt cold. V2's softer continents + pulsing pings reads as living. |
| **Escrow diagram** | light vs. dark | **dark** | Dark made the data-flow lines and lock states more legible. |
| **§09 FAQ rendering** | open/closed accordion vs. all open | **all open in wireframe** (collapsed in production) | Wireframe needs to expose all copy for review; production prioritizes scan. |
| **Footer style** | marketing footer (large CTAs, social grid) vs. system colophon | **system colophon** | Page already closed in §10. Footer's job is to register, not persuade. The colophon style matches Tenda's "regulated infrastructure" tone. |
| **Three-audience split** | nav-led (Product / Pricing / Docs) vs. audience-led (Workers / Posters / Traders) | **audience-led**, mirrored in §08 columns + §11 sitemap | Tenda is a marketplace — the visitor's question is "is this for me?" not "where's the API?" |
| **Numbers strategy** | unique numbers per section vs. one shared triple | **shared triple** (1.7s · 1.5% · 0.4%) repeated across §01, §02, §06, §10, §11 | Repetition is conviction. If one number moves, all move. |
| **Composition method** | server-side stitching vs. iframe + CSS injection | **iframes** | Sections evolve independently; renaming all class names globally for one merged file would risk regressions for no benefit at the wireframe stage. Production gets components anyway. |

---

## 9. Open questions / next steps

- [ ] **Legal sign-off** on the §11 footer disclaimer text. Currently flagged PROPOSE.
- [ ] **Real numbers** — every stat is currently a plausible-looking placeholder. Wire to product analytics before launch.
- [ ] **Imagery pass** — the wireframe is type-and-rule throughout. If the brand wants photography (workers in Lagos, POS terminals, riders), candidate slots are §01 hero right column (replacing the card stack with a hero photo + smaller card overlay), §08 audience columns (a portrait per audience), and §11 footer (a single full-bleed atmospheric shot above the colophon).
- [ ] **i18n.** Footer already lists 14 countries and 7+ currencies; the page itself is English-only. Decide which languages ship at launch — the region pill in §11 is the entry point.
- [ ] **A/B candidate:** dark hero (current) vs. light hero. The dark spine is cohesive but light-mode hero may convert better in casual social-share previews.
- [ ] **Mobile §03 and §08 are very tall** (1700px and 2400px respectively). Consider a horizontal swipe / snap layout on mobile to compress.

---

## 10. Quick map for the next agent

| If you need to… | Open this file |
|---|---|
| Tweak shared type / colors | `landing/landing.css` |
| Edit a section's content | `landing/sections/0X-*.html` |
| Reorder the page or change desktop/mobile defaults | `landing/landing.html` (look for `<iframe class="section-iframe">` array) |
| Adjust canvas layout / artboard sizes | `landing/canvas.html` (`SECTIONS` const) |
| Re-target which `.frame-wrap` a composer shows | `data-target-desktop` / `data-target-mobile` on each iframe in `landing.html`, or `idx` field in `canvas.html`'s `SECTIONS` |
| Find where a copy string lives | `grep` the section file directly — copy is inline in HTML, not in a JSON deck |

---

*Last updated: with the v1 wireframe ship. Next major revision: when production conversion begins.*
