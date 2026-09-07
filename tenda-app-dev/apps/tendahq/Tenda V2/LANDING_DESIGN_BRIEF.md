# Tenda — Landing Page Design Brief

**For:** Visual design agent producing wireframes / hi-fi mocks
**Deliverable:** Section-by-section wireframe (HTML or Figma) for tendahq.com — desktop + mobile breakpoints
**Stack constraint:** Will be implemented in Vite + React 19 + **Tailwind CSS v4**, **no shadcn**, **Lucide** icons, **React Router**. Wireframe should be Tailwind-translatable.
**Inspiration tone:** Linear · Vercel · Phantom · Stripe — confident, dense-but-airy, pro-tier crypto/fintech.

---

## 1 · Mission

The current site at `apps/tendahq` ships a competent v1 (Hero → Problem → Stats → How it works → Why → Who → Download) but:

1. **Half the product is missing.** Tenda is two marketplaces in one app — **Gigs** (real-world tasks for SOL) and **Exchange** (P2P fiat ↔ SOL with payment-method whitelisting and on-chain escrow). The current landing only sells Gigs.
2. **The visual language is generic.** Inter + cool-grey. The mobile app has a distinctive system (Space Grotesk + Manrope + JetBrains Mono, warm cream / deep-navy theme, category-coloured chips, mono numerics for money). The site should feel like the same product.
3. **No product surface shown.** Hero is a text headline with no visualisation of the app, escrow, or live offer feel.

Redesign goals:

- **Sell both halves** — Gigs (workers earn) + Exchange (P2P trade) — through one coherent narrative ("escrow is the product").
- **Show the product** — phone mockups, an animated escrow card, a live-feel offer ticker.
- **Adopt the mobile brand system 1:1** so the landing reads as the same brand as the app.
- **Stay sharp on mobile** — Android-first audience, sticky CTA, lightweight asset weight.

---

## 2 · Product context (verified facts only)

Use these facts as the source of truth. Do not invent stats or capabilities.

### What Tenda is
A non-custodial, Solana-based marketplace mobile app combining two flows:

1. **Gigs** — local & digital tasks. Posters fund SOL into escrow at gig creation; workers (called "seekers" inside the app) browse, accept, submit photo/video proof, and receive SOL on approval. Categories: **delivery, photo, errand, service, digital**.
2. **Exchange** — P2P fiat ↔ SOL trading. A seller funds SOL into escrow; a buyer accepts at a published rate, pays off-chain via a whitelisted payment method (bank transfer, mobile money: M-Pesa, MoMo, OPay, etc.), uploads payment proof, and the SOL releases. Has a **payment window timer**, **dispute mediation flow**, and **multi-currency** support.

### Verified numbers (from `apps/tendahq/src/app-info.ts`)
- `< 2s` escrow lock
- `2.5%` platform fee
- `100%` on-chain
- Powered by `Solana`

### Supported fiat currencies (with flags) — from `@tenda/shared/constants/currencies`
🇳🇬 NGN · 🇬🇭 GHS · 🇰🇪 KES · 🇿🇦 ZAR · 🇵🇭 PHP · 🇺🇸 USD · 🇬🇧 GBP · 🇪🇺 EUR

### Distribution
- **Android APK** available now (link in `app-info.ts`)
- **iOS** — "coming soon"
- Web/PWA — out of scope for this brief

### What we do NOT have (do not show)
- No iOS app yet.
- No play store / app store listings yet.
- No published user counts, GMV, TVL, testimonials, press logos — **don't fabricate them**. Use placeholder slots with `[stat coming]` if a section structurally needs one.
- No live chart / TradingView. Exchange offers are listed by users, not algorithmic.

---

## 3 · Audience & message

Two reader buckets, ranked:

| Persona | Primary need | Hook |
|---|---|---|
| **Crypto-native earner** in NG/GH/KE/ZA/PH | Earn SOL on side gigs without delays | "Get paid the moment proof is approved." |
| **P2P trader** moving SOL ↔ local fiat | Trade without exchange custody risk | "Trade SOL with strangers safely. Escrow holds, you hold the keys." |
| **Poster** with one-off tasks | Verified delivery without chasing freelancers | "Lock the budget once. Release on proof." |

Single-line value prop the whole page should reinforce:

> **Escrow on Solana for gigs and P2P trades. Funds lock up front. Proof releases them.**

---

## 4 · Brand system — adopt from `apps/mobile/theme/tokens.ts`

The landing currently runs its own colour palette. **Replace it with the mobile tokens below** so site and app feel identical. All values are exact, not approximate.

### 4.1 Colour — **light mode** (default) and **dark mode**

| Token | Light | Dark |
|---|---|---|
| `surface.background` | `#F7F5F0` (warm cream) | `#0D1018` |
| `surface.backgroundAlt` | `#F0EDE6` | `#111521` |
| `surface.card` | `#FFFFFF` | `#161B29` |
| `surface.inset` | `#EDE9E1` | `#131826` |
| `brand.primary` | `#2E5BD6` | `#5E87E8` |
| `brand.primarySurface` | `#E8EEFB` | `rgba(94,135,232,0.14)` |
| `brand.primaryBorder` | `#BFD0F2` | `rgba(94,135,232,0.32)` |
| `accent.primary` (seeker / orange) | `#E08A3C` | `#F0A365` |
| `accent.primarySurface` | `#FCEFDF` | `rgba(240,163,101,0.14)` |
| `content.primary` | `#141721` | `#F4F2ED` |
| `content.secondary` | `#4E525B` | `#B6BAC5` |
| `content.tertiary` | `#8A8E98` | `#7A8096` |
| `border.subtle` | `rgba(20,17,10,0.05)` | `rgba(255,255,255,0.04)` |
| `border.default` | `rgba(20,17,10,0.10)` | `rgba(255,255,255,0.08)` |
| `feedback.success.base` | `#1F9D6B` | `#3ACB8E` |
| `feedback.warning.base` | `#C9780C` | `#F0A365` |
| `feedback.danger.base` | `#CB3A3A` | `#F0706E` |
| `utility.money` | `#1F9D6B` | `#3ACB8E` |

**Category tones** — used wherever a gig category badge appears (delivery / photo / errand / service / digital). Light pairs first:

| Category | base | surface | text |
|---|---|---|---|
| delivery 📦 | `#3B82F6` | `rgba(59,130,246,0.10)` | `#2A4FAA` |
| photo 📸 | `#8B5CF6` | `rgba(139,92,246,0.10)` | `#5A389C` |
| errand 🏃 | `#D98722` | `rgba(217,135,34,0.12)` | `#8C5812` |
| service 🛠 | `#1F9D6B` | `rgba(31,157,107,0.10)` | `#156E4A` |
| digital 💻 | `#E0579D` | `rgba(224,87,157,0.10)` | `#9A3E6C` |

**Default theme:** light. **Honour `prefers-color-scheme`** for auto-switch. (App ships both — landing should too.)

### 4.2 Typography — **three families**

| Family | Use | Weights |
|---|---|---|
| **Space Grotesk** | All display headings (`hero`, `h1`, `h2`, `h3`) | 500 / 600 / 700 |
| **Manrope** | All body, button, label, caption | 400 / 500 / 600 / 700 |
| **JetBrains Mono** | All numeric values: SOL amounts, fiat amounts, rates, countdowns, wallet addresses, eyebrows | 400 / 500 / 600 / 700 |

Type scale (mobile tokens — adapt up for web):

| Style | Family | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| `hero` (web bumps to 64–80) | Space Grotesk | 44 / 50 | 700 | -1.2 |
| `h1` (web 40–48) | Space Grotesk | 30 / 36 | 700 | -0.6 |
| `h2` | Space Grotesk | 22 / 28 | 600 | -0.4 |
| `h3` | Space Grotesk | 20 / 26 | 600 | 0 |
| `title` | Manrope | 17 / 24 | 600 | 0 |
| `body` | Manrope | 15 / 22 | 400 | 0 |
| `body-small` | Manrope | 13 / 18 | 400 | 0 |
| `label` (eyebrows, ALL-CAPS) | Manrope | 12 / 16 | 600 | +0.24 |
| `caption` | Manrope | 11 / 14 | 500 | +0.12 |
| `mono-large` (hero numbers) | JetBrains Mono | 40 / 44 | 600 | -0.2 |
| `mono-mid` | JetBrains Mono | 22 / 26 | 600 | 0 |
| `mono` | JetBrains Mono | 15 / 20 | 500 | 0 |
| `mono-small` | JetBrains Mono | 12 / 16 | 500 | 0 |

**Numeric rule** (carried over from mobile): every fiat/SOL/rate/timer/wallet number is **mono**. Never set money in Manrope.

### 4.3 Radius

`xs 8 · sm 12 · md 16 · lg 20 · xl 24 · card 20 · sheet 24 · full 9999`

Cards = 20. Pills = 9999. CTA buttons = 14–16.

### 4.4 Spacing scale

`2xs 4 · xs 8 · sm 12 · md 16 · lg 20 · xl 24 · 2xl 32 · 3xl 40 · 4xl 48 · 5xl 64`

### 4.5 Motion

| Speed | ms | Use |
|---|---|---|
| instant | 90 | press feedback |
| fast | 150 | hover state |
| normal | 220 | tab/segment switches |
| slow | 320 | section reveals |
| emphasis | 480 | hero entrance, big number count-ups |

Standard easing: `cubic-bezier(0.2, 0, 0, 1)`. Spring (for the escrow card lock animation): damping 18 / stiffness 200.

### 4.6 Iconography

**Lucide only.** No Phosphor. Keep stroke 1.5–1.75 to feel mature. Category emojis (📦 📸 🏃 🛠 💻) are fine for chips but headers stay icon-only.

### 4.7 Asset inventory available
- `apps/tendahq/src/assets/logo-full.png` — full wordmark (existing landing uses it)
- `apps/tendahq/src/assets/tenda-icon-blue.png` — square icon
- Mobile screenshots — **need new captures** from the V2 wireframes at `Tenda-redesign/Tenda V2/*.html` (home, gig-detail, exchange-detail, wallet, messages-chat). Designer can render frames in iPhone 15 Pro chrome at 1242×2688.

---

## 5 · Information architecture

**Single landing route** (`/`). Existing routes `/terms` and `/privacy` stay as-is, untouched.

Order (top → bottom). Sections marked **NEW** are additions; **REWORK** means redesign existing; **KEEP** means structure stays, restyle to new tokens.

| # | Section | Status | One-line goal |
|---|---|---|---|
| 0 | Sticky navbar | KEEP, restyle | Logo · nav links · primary CTA. Glassy on scroll. |
| 1 | **Hero** | REWORK | Headline + animated escrow card + dual CTA + supported-currency marquee. |
| 2 | **Trust strip** | NEW | 4 hard facts in a thin band: `< 2s lock · 2.5% fee · 100% on-chain · Solana`. |
| 3 | **Two products** | NEW | Side-by-side intro of **Gigs** and **Exchange** — the core re-pitch. |
| 4 | **How escrow works** | REWORK (replaces existing How It Works) | One unified 3-step flow with a flow-line illustration; toggle between "Gig" and "Exchange" examples. |
| 5 | **Live-feel offer ticker** | NEW | Horizontal marquee of mock offer cards (price-leading mobile gig card + exchange offer card) at slow speed. Sells the "what's on the app right now" feeling. |
| 6 | **Why Tenda (4 pillars)** | KEEP, restyle | Escrow up front · Proof before payout · Non-custodial · Structured disputes. |
| 7 | **Coverage** | NEW | Globe + list of supported fiat currencies and emerging markets. |
| 8 | **Two sides, one app** | KEEP, rework copy | Workers / Posters / Traders — three columns now, not two. |
| 9 | **FAQ** | NEW | 6–8 collapsible Q&A. Disclosures on custody, dispute path, fees, devnet vs mainnet. |
| 10 | **Final CTA** | KEEP, restyle | Phone mockup + Download APK + iOS waitlist email field. |
| 11 | Footer | KEEP, restyle | Logo · links · socials · "Built on Solana" badge. |

Old `Problem` section is **dropped** — its content is folded into Two-Products framing. Old `Stats` → becomes the thin trust strip (#2). Old `WhoItsFor` becomes #8.

---

## 6 · Section-by-section spec

For each section the brief gives: **layout**, **content (verified copy or placeholders)**, and **visual direction**. All spacing values are mobile defaults — scale up at `lg+`.

### 6.0 Sticky navbar

- Height 64. Glassy on scroll: `backdrop-blur-xl` over `surface.navbar` (`rgba(247,245,240,0.90)` / `rgba(13,16,24,0.90)`).
- **Left:** wordmark (24h).
- **Center (md+):** `Gigs` · `Exchange` · `How it works` · `For who` · `FAQ`.
- **Right:** ghost theme toggle (sun/moon) · primary CTA `Download App`.
- **Mobile:** hamburger → full-screen sheet with sectioned list, ChevronRight glyphs, sticky download button at the bottom of the sheet.
- Border-bottom only when scrolled — clean when at the top.

### 6.1 Hero

**Layout (desktop):** 12-col grid. Left 7 cols copy. Right 5 cols animated escrow card. Min-height 92svh. Top padding 96.

**Left column:**
- **Pill eyebrow** (32h, primarySurface bg, primaryBorder, mono-small): `🟢 LIVE ON SOLANA · DEVNET`
- **H1 hero** (Space Grotesk 700, web ~72/76, tracking -0.04em):
  > Get paid.
  > **No middlemen.**
  (Second line in `content.tertiary` for visual hierarchy — same trick as existing.)
- **Sub** (Manrope 18/28, content.secondary, max 56ch):
  > Tenda is the on-chain marketplace for gig work and P2P fiat trades. Escrow locks SOL the moment a job is posted or an offer is published — proof releases it.
- **Dual CTA row:**
  - Primary `Download for Android` (`brand.primary` fill, white text, 14r, 52h, mono download icon).
  - Outline `See how escrow works` (border `border.strong`, transparent fill).
- **Trust ticks** (mono-small, content.tertiary, dot separators):
  `Non-custodial · Open-source contracts · 2.5% flat fee`

**Right column — animated "Escrow card" hero visual:**
- A single tilted card (perspective transform, ~6deg Y rotation) that sells the product at a glance. Card spec:
  - 360w × 480h, radius 24, `surface.card`, border `border.default`, shadow `elevated`.
  - Top row: status pill `🟢 ESCROW LOCKED` (success.surface bg, success.text), trailing mono countdown `02:14:48`.
  - Center hero number: `2.000 SOL` in mono-large + arrow `→` + `490,000 NGN` in mono-mid. Two-line "Rate: ₦245,000 / SOL · +1.2% above market" in mono-small green.
  - Divider.
  - Two meta cells: `Payment window 30 min` · `Tenda fee 0.050 SOL`.
  - Bottom: avatar + handle `@chiamaka` · `4.9★ · 38 trades`.
- **Animation:** on viewport entry, the status pill flips from `⏳ FUNDING` → `🟢 ESCROW LOCKED` (220ms), the SOL number count-ups from 0 → 2.000 (480ms), and a brand-tinted ring pulses around the card once (slow). After that, idle. **No infinite shimmer** — feels cheap.
- A second smaller card (the gig variant) peeks behind it at -3deg rotation, dimmed to 60%, showing `📦 Deliver groceries · 0.5 SOL · ⏱ 45m left`. Sells "two products."

**Below the hero, full-width:** **supported-currency marquee.** Single line, mono-small, slowly scrolling left:
`🇳🇬 NGN  ·  🇬🇭 GHS  ·  🇰🇪 KES  ·  🇿🇦 ZAR  ·  🇵🇭 PHP  ·  🇺🇸 USD  ·  🇬🇧 GBP  ·  🇪🇺 EUR  ·` (loop). Border-y `border.subtle`. Pause on hover. 56h band.

### 6.2 Trust strip

Thin (88h) full-width band sitting directly under the hero marquee. 4 numbers, equal columns, divider lines between (`border.subtle`). Each cell:

- Number: mono-large, `content.primary`, accent gradient on the colon character if any.
- Label: caption ALL-CAPS, content.tertiary.

| Value | Label |
|---|---|
| `< 2s` | `ESCROW LOCKED` |
| `2.5%` | `FLAT FEE` |
| `100%` | `ON-CHAIN` |
| `Solana` | `POWERED BY` (use Solana wordmark glyph) |

No card chrome. Background = page bg. The whole strip reads as a typographic statement, not a widget.

### 6.3 Two products — the core pivot section

This is the section that fixes the "Exchange is invisible" problem. **Side-by-side framing**, generous whitespace, contrasting accent colours so each product gets its own identity.

**Layout (desktop):** 2-column grid, equal width, gap 32. Stacks to single column < `lg`.

**Card A — Gigs (left, brand.primary accent)**
- Top row: 56×56 brand-tinted icon tile (Lucide `Briefcase`).
- Eyebrow `MARKETPLACE` (label, brand.primary).
- H2 `Gigs that pay on proof.`
- Body: `Post or accept tasks — delivery, photo, errands, services, digital. Funds lock when a gig is posted. Workers submit photo or video proof. Approval releases SOL on the spot.`
- **Mini visual:** stacked preview of 3 gig cards (price-leading variant from the mobile wireframe `home.html`):
  - Card 1 — `📦 DELIVERY · 0.5 SOL · 45m left · @yemi`
  - Card 2 — `📸 PHOTO · 1.2 SOL · 4h left · @kimani`
  - Card 3 — `🛠 SERVICE · 0.8 SOL · 2d left · @rashim`
  Each rendered with category-tone chip on the left edge, mono SOL amount on the right, deadline in small mono. Pulled directly from `Tenda V2/home.html`.
- Footer link: `Browse gigs in the app →` (brand.primary, no underline, hover underline).

**Card B — Exchange (right, accent.primary orange accent)**
- 56×56 accent-tinted icon tile (Lucide `ArrowLeftRight`).
- Eyebrow `P2P TRADE` (label, accent.primary).
- H2 `Trade SOL ↔ local cash, without a middleman.`
- Body: `List or accept SOL ↔ fiat offers in NGN, GHS, KES, ZAR, PHP, USD, GBP, EUR. Pay via bank transfer or mobile money. Escrow only releases when both sides confirm.`
- **Mini visual:** one full Exchange offer card (the OfferSummaryCard from `exchange-detail.html`):
  - Top: `🟢 OPEN` pill + payment-method chips `OPay · Kuda · MoMo`.
  - `2.00 SOL → 490,000 NGN` rate row (mono hierarchy).
  - Sub: `Rate ₦245,000 / SOL · +1.2% above market`.
  - 2 meta cells: `Payment window 30 min · Tenda fee 0.050 SOL`.
- Footer link: `Open the exchange →` (accent.primary).

**Below both cards, centered:** small caption — `Same wallet. Same escrow. One app.`

### 6.4 How escrow works — unified 3-step

Replace existing `HowItWorks`. One flow, not two parallel ones — the steps are structurally identical because both products share the escrow contract. Use a **segmented toggle** at the top to swap the *example copy*, not the *step structure*.

**Toggle (24h, pill, segmented control):** `Gig example` (default) ⇄ `Exchange example`

**Layout:** vertical timeline on mobile, horizontal flow on desktop. 3 steps connected by a hairline path with an animated brand-coloured dot that travels left → right on viewport-enter (one pass, no loop).

**Step cards (all states):**

| Step | Title | Gig copy | Exchange copy |
|---|---|---|---|
| 1 | **Lock** | Poster funds 0.5 SOL into escrow when the gig is published. | Seller funds 2 SOL into escrow when the offer goes live. |
| 2 | **Prove** | Worker accepts, completes the task, uploads photo proof. | Buyer accepts, sends NGN via OPay, uploads payment screenshot. |
| 3 | **Release** | Poster approves the proof. SOL lands in the worker's wallet. | Seller confirms NGN received. SOL releases to the buyer. |

Each step card:
- Hero number `01` / `02` / `03` in mono-large, brand.primary, behind the title (low-opacity background number trick — Linear-esque).
- Title H3.
- Body Manrope 15/22 content.secondary.
- Tiny tag underneath: `~ 5–60 sec on-chain` (step 1) · `~ varies` (step 2) · `~ 1–3 sec on-chain` (step 3).

### 6.5 Live-feel offer ticker

Horizontal marquee of mock cards, slow scroll right → left, **two rows** moving in opposite directions for visual rhythm.

- Row 1: 6 gig cards (compact variant from `home.html`).
- Row 2: 4 exchange offer cards (compact variant).
- Each card 320w × 88–100h. Spacing 16. Cards are `surface.card`, border `border.default`, radius 18.
- Pause on hover. Cards fade at the left/right edges via mask gradient (~80px each side).
- **No real data**, fully static mocks, but each card uses **realistic copy** drawn from the wireframes (varied currencies, varied categories, varied SOL amounts, varied countdowns).
- Title above the marquee (centered): `What's live right now` with a tiny green pulsing dot. Below: caption `Updated continuously by the community.`

This section is what makes the page feel like an actual marketplace, not a brochure.

### 6.6 Why Tenda — 4 pillars

Keep existing structure but restyle to mobile tokens.

- **Layout:** 1 hero pillar (left, larger) + 3 supporting pillars (right, stacked) at `lg+`. Stacks to vertical on mobile.
- **Hero pillar — "Escrow is part of the workflow":**
  - 56×56 primarySurface tile, Lucide `Zap`.
  - H2 + body (existing copy is good — port over).
  - Background: subtle radial brand-tint glow at the top-left.
- **Supporting pillars (each 24-padded card, surface.card, border.default, radius 20):**
  1. `Camera` · **Proof before payout** · `Workers submit clear photo or video proof before payment is released.`
  2. `Lock` · **Non-custodial by default** · `Tenda never takes custody of your funds. The contract handles settlement.`
  3. `Scale` · **Structured dispute flow** · `If a task is contested, resolution follows a defined path instead of guesswork.`
- All 4 use **brand.primary** at the icon (no rainbow).

### 6.7 Coverage

A breathing-room section that signals geographic ambition without overclaiming.

- **Left:** H2 `Built for emerging markets first.` + body `Naira, cedi, shilling, rand, peso — plus dollar, pound, euro. Add bank or mobile-money methods that fit your country.`
- **Right:** an 8-cell flag grid (160w × 80h cells, surface.card, hairline border). Each cell:
  - Top-left: large flag emoji at 28px (or a flat SVG flag if the agent prefers).
  - Bottom-left: ISO code in mono-small (e.g. `NGN`).
  - Bottom-right (small caption): currency name (`Naira`).
  - Hover: tile lifts 1px, brand-tinted border.
- Below the grid, caption: `8 currencies live · more rolling out per region` (no fake numbers).

### 6.8 Two sides, one app — three columns

Replace existing two-column "Workers / Posters" with **three** columns: **Workers · Posters · Traders**. Same anatomy as 6.6 supporting pillars but column layout.

| Column | Icon | Headline | List items (4) |
|---|---|---|---|
| **Workers** | Briefcase (brand.primary) | Earn SOL on real-world gigs. | Side hustlers · Freelancers tired of payment delays · Crypto-native earners · Anyone who wants instant SOL payouts |
| **Posters** | ClipboardList (brand.primary) | Get verified delivery, no chasing. | Small businesses · One-off task posters · Crypto-savvy entrepreneurs · Anyone who wants verified work done |
| **Traders** | ArrowLeftRight (accent.primary 🟧 — visual differentiator) | Move SOL ↔ cash on your terms. | Cross-border earners cashing out · Local SOL buyers · Mobile-money first users · Anyone tired of CEX KYC stalls |

Each column has its own primary CTA at the bottom: `Start earning` (brand) · `Post your first gig` (outline) · `Open the exchange` (accent fill).

### 6.9 FAQ

8 questions, accordion (single-open). Use Lucide `ChevronDown` rotated 180 on open. Card surface.card, divider hairlines between rows.

Questions to include (verified, do not invent):
1. Is Tenda custodial? — *No. SOL sits in an on-chain escrow program. Tenda never holds keys.*
2. What chain are you on? — *Solana. Currently on devnet for the v0.2 release; mainnet rolling out per the roadmap.*
3. What's the fee? — *2.5% flat platform fee, taken on settlement.*
4. What happens if there's a dispute? — *Either party can open a dispute thread. Tenda mediation reviews proof and rules; the escrow releases per the ruling.*
5. Which fiat currencies are supported on Exchange? — *NGN, GHS, KES, ZAR, PHP, USD, GBP, EUR — list grows per region.*
6. iOS app? — *Not yet. Android APK is live. iOS is on the roadmap.*
7. Do I need a Solana wallet to use Tenda? — *Yes — connect via Mobile Wallet Adapter on first launch.*
8. Is the contract open-source? — *Yes — link to GitHub.*

### 6.10 Final CTA

Echoes the existing Download section but pulled forward visually with a **device frame**.

- **Layout:** centered card, `1100w × auto`, padding 64. Background: linear gradient from `brand.primarySurface` at top → `surface.card` at bottom. Border: `brand.primaryBorder`. Radius 32.
- **Left (60%):** H2 `Ready to get paid?` · body `Download Tenda for Android. Connect a Solana wallet. Start posting, working, or trading in under a minute.` · primary CTA `↓ Download APK (12.4 MB · v0.2 devnet)` (use the real version from app-info if shipping). Below the button: a small inline form `Notify me when iOS launches` (email + Submit). On submit → simple thank-you state, no real backend required for v1 — store to a placeholder endpoint or open mailto.
- **Right (40%):** **iPhone-15-Pro mockup** showing the home screen of the mobile app (rendered from the `home.html` wireframe). Tilted ~3deg, `shadow-modal`, with a faint brand-tinted glow behind it. A second device peeks behind at smaller scale showing `exchange.html`.

### 6.11 Footer

3-column on desktop, stacks on mobile.

- **Col 1:** Logo + tagline `Trustless escrow on Solana.` + small mono `v0.2.0-devnet` badge.
- **Col 2:** Links — `How it works · Why Tenda · For who · FAQ · Terms · Privacy`.
- **Col 3:** Socials — X (Twitter), WhatsApp community, Discord (placeholder), Telegram (placeholder), GitHub (placeholder). Each as a 36×36 ghost button with Lucide icon, brand-tinted on hover.
- **Bottom row:** `© 2026 Tenda · Built on Solana 🌌 · Made for emerging markets.` Tiny mono.

---

## 7 · Interaction & motion notes

- **Section reveal:** translateY(8) → 0 + opacity 0 → 1, 320ms emphasis easing, staggered children at 60ms.
- **Hero card lock animation:** runs once on viewport enter; **no infinite loops anywhere on the page** (banner-blindness).
- **Marquee speed:** 40s per loop on hero currency strip, 60s per loop on offer ticker. Pause on hover. `prefers-reduced-motion` → static.
- **Theme toggle:** transition `colors 220ms`. No flicker.
- **CTA hover:** translateY(-1) + brand glow shadow grows 4px. 150ms.
- **No parallax on mobile** (cheap, motion-sick).

---

## 8 · Responsive breakpoints

Match Tailwind defaults:

| BP | Width | Behaviour |
|---|---|---|
| base | 360–639 | single column everywhere; sticky bottom CTA bar appears below 640 with `Download` only |
| `sm` | 640+ | inline hero CTAs (no stack); 2-up cards |
| `md` | 768+ | 3-col where defined; nav links visible; marquee speed reduces |
| `lg` | 1024+ | full hero split; sticky bottom bar disappears |
| `xl` | 1280+ | container widens to `max-w-7xl` |

**Sticky mobile CTA** (NEW): 56h bar pinned to viewport bottom on mobile only, content `[Tenda icon]  Get paid. No middlemen.   [Download →]`. Auto-hides when the in-page Download CTA scrolls into view.

---

## 9 · Accessibility

- Contrast ratios ≥ 4.5:1 for body text; the listed tokens already satisfy this.
- All interactive elements have visible `:focus-visible` ring (2px, `brand.focusRing`).
- Marquee respects `prefers-reduced-motion`.
- Form fields (iOS waitlist email) have a real `<label>` (visible or visually-hidden).
- All Lucide icons that aren't decorative get `aria-label`. Decorative icons → `aria-hidden`.
- Theme toggle is a `button` with `aria-pressed`.

---

## 10 · Tech constraints (for the agent's awareness)

- **Tailwind v4** — design tokens become CSS custom properties under `@layer base :root` and `@media (prefers-color-scheme: dark)`. All colour values used in classes via `[var(--token)]` or arbitrary values.
- **No shadcn / no Radix.** Build the accordion, segmented control, marquee, theme toggle from scratch with React 19 + Tailwind only.
- **Lucide icons** — already installed.
- **No Framer Motion** unless absolutely needed (page weight). Use CSS transitions + `IntersectionObserver` for reveals; one minimal `requestAnimationFrame` for the count-up.
- **Fonts** — load Space Grotesk + Manrope + JetBrains Mono via `@fontsource` packages (already common pattern), or Google Fonts `<link>`. Self-host if easy.
- **Images** — favour SVG mock-ups of mobile cards over actual screenshots where possible; reserve PNG screenshots for the device-frame in §6.10.
- **No backend changes.** Email capture for iOS waitlist can be a `mailto:` or a static-form provider (Formspree, Buttondown). Out of scope for design.

---

## 11 · Deliverables expected back

For each of the 12 sections (0 navbar through 11 footer):

1. **Desktop wireframe** (1440w, light theme).
2. **Mobile wireframe** (390w, light theme).
3. **One section in dark theme** (designer's choice — pick the one that benefits most).
4. **Asset list** for any custom illustrations (escrow card, device-frame screenshots, flow-line SVG).
5. **Annotation layer** on each frame calling out: spacing values, font tokens used, and any motion notes.

Format: HTML mockup (preferred — drops straight into our Tailwind v4 setup) **or** Figma frames with the design tokens pre-loaded as variables.

If choosing HTML, drop the file into `apps/tendahq/wireframe/landing.html` for handoff. If choosing Figma, share the file link and a one-paragraph rationale for any deviations from this brief.

---

## 12 · Out of scope

- Blog / changelog page.
- Authenticated app dashboards (those live in the React Native app, not the marketing site).
- Multi-language (English only for v1).
- Animated 3D / WebGL hero (deliberate — page weight).
- Real charts or any feed connected to a live RPC. Marquee data is static mock.

---

## Reference materials in this repo

| Path | What it gives the designer |
|---|---|
| `apps/mobile/theme/tokens.ts` | Source of truth for every colour, font, radius, motion value used in this brief |
| `Tenda-redesign/Tenda V2/home.html` | Gig card visual language |
| `Tenda-redesign/Tenda V2/exchange.html` | Exchange list card visual language |
| `Tenda-redesign/Tenda V2/exchange-detail.html` | Full OfferSummaryCard + PaymentWindowBanner — re-use in hero |
| `Tenda-redesign/Tenda V2/wallet.html` | Wallet/transaction card style — possible footer accent |
| `apps/tendahq/src/app-info.ts` | Verified copy, stats, links — single source of truth for all numbers |
| `apps/tendahq/src/components/sections/*` | Existing v1 sections — reference for what to KEEP / REWORK |

End of brief.
