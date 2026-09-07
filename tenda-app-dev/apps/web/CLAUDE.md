@AGENTS.md

# apps/web working rules

## Source of truth

The comps (`docs/web-app-stages/tenda-web-app-design/` + `ui-ux-brief.md`) win on
**visuals** — layout, spacing, tokens, states, empty/error copy.
`apps/mobile` + `@tenda/shared` win on **behaviour** — every flow, data shape, permission
rule, copy, and *which surfaces exist at all*. Before building any screen, read its mobile
counterpart. Where the two disagree, behaviour wins — log the divergence in
`docs/web-app-stages/spec-corrections.md`.

The spec contains confirmed errors: it still designs a wallet **Buy** side, but Buy/onramp
was retired in #61 (correction #1). Never port a surface the product has retired.

**Shell architecture (user, 2026-08-16 — supersedes the 2026-08-15 "chrome need not follow
the comps" direction; see correction #6).** The comps specify three shells, and they are
binding:

| Shell | Used by | Shape |
|---|---|---|
| **Workspace** | Tier 2, Tier 3, Settings & Profile | 64px icon rail \| 380px list column \| detail pane, `height:100vh` with per-pane scrolling |
| **Centered public** | Tier 1 | no rail, max-width 1240px |
| **Focused** | Auth, Post Wizard | no rail, max-width 640–1000px |

Workspace collapses at ≤1100px (list → 320px) and ≤900px (single pane). `apps/tendahq`
remains the marketing/landing surface; this app is purely app functionality.

Route groups map to shells (groups do not change URLs):

| Group | Shell | Guard |
|---|---|---|
| `app/(app)` | workspace | `AuthGate` in the layout |
| `app/(public)` | centered public | none |
| `app/(focused)` | focused | none — `/signin`, `/onboarding/profile` |
| `app/(focused)/(authed)` | focused | `AuthGate` — `/post` |

**Tier-1 public shell.** `app/(public)/layout.tsx` applies NO measure — its pages are
full-bleed sections that each centre their own content at `max-w-content` (1240px, a
`--container-content` theme token) — `/support` included, since #13 gave it the comp's
two-column shell and it now owns the same measure as the feed. **Do not add a
`loading.tsx` to a public route**: it wraps the segment in a Suspense boundary, and React
streams the real content behind an inline script that swaps it in — so with JavaScript
disabled the page renders an empty `<main>`. The feed is the anonymous, indexable front
door; `e2e/public-discovery.spec.ts` runs it with `javaScriptEnabled: false` as the
tripwire. A client-fetched surface (`/gigs`, `/home`) may show a skeleton freely — no
Suspense is involved there.

**#60 (2026-09-03) moved browsing to `/gigs` and made `/home` a dashboard.** `/gigs` is
the workspace's open-feed surface — the list column (`@list/gigs` at BOTH depths, per the
slot rule below) beside the shared listing pane, or, in the reader's remembered GRID view
(`lib/gigs/browse-view.ts`, one localStorage preference shared with the public landing),
a full-pane card grid with no column until a card is opened. `/home` is composed on the
client from the hooks the other surfaces already run (`components/home/Dashboard.tsx`) and
NEVER shows the open feed; the one-call overview endpoint is #61. The landing's hero is one
compact band (`FeedHero`) and its heading subline carries the LIVE facts the page already
fetched — chains from the registry, markets from the facets, the fee from
`/v1/platform/config` — each omitted, never invented, when its read failed. Every chain
named anywhere is `components/shared/ChainBadge` over shared `chainDisplay`.

**The same trap has a second form: `error.tsx` is a client component too.** Its
fallback is swapped in by the hydration script, so a server-side read failure
rendered a completely blank page with JavaScript off — measured — on the one
surface whose premise is that it works without the bundle, at the moment a
reader most needs telling their escrow is untouched. So a public page **handles
its own read failure**: `listGigsOnce` answers `null` instead of throwing, the
page renders `FeedErrorStatic` server-side, and `generateMetadata` marks that
render `noindex` because it necessarily answers HTTP 200. `error.tsx` stays for
anything thrown elsewhere in the tree. The rule for both forms: *if it only
appears after hydration, an anonymous visitor may never see it.*

**A third form is DECIDED, not solved: `notFound()`.** Next defers the whole
not-found boundary into the flight payload when `notFound()` is thrown from a
dynamic page, so `/gig/[id]` 404s are blank without JavaScript — measured, and
not a property of the boundary file (removing it blanks the root boundary the
same way, while an unmatched route like `/nowhere-at-all` renders fine).
Next 16.2 adds `forbidden()` / `unauthorized()`, but they answer 403/401 for a
different situation — neither renders a 404 body without JavaScript, so neither
is a way out of this.

**The decision (user, 2026-08-18, task #24): KEEP `notFound()` and accept the
blank page.** The 404 + `noindex` is what keeps taken-down and draft gigs out
of the index, and that contract is carried by the STATUS, not by a meta tag —
serving the copy at HTTP 200 would trade it away. What the blank page costs is
bounded: an anonymous visitor with JavaScript off, following a link to a gig
that is gone, mistyped or taken down. The feed AND a live gig detail page both
render without the bundle — that bound is the premise of this decision, so it is
held by a test rather than assumed (`public-discovery.spec.ts`, "a LIVE gig
detail page renders too"). Parties are unaffected in practice —
`PrivateGigRescue` needs JavaScript either way.

So: do not "fix" this by dropping `notFound()`, and do not add Edge middleware
to serve the body (decision #5 keeps this app middleware-free). If you are here
because the blank page bit someone, the thing that changed is the cost side of
that trade — reopen the decision, do not quietly invert it.

Two more rules this shell learned the hard way, both measured in a real browser:

- **The public header row must fit 320px.** It cannot wrap and nothing in it
  shrinks, so anything that does not fit pushes the sign-in button past the
  viewport and scrolls the whole *document* sideways — on the anonymous front
  door, where most traffic is mobile. `px-6` is the measure (it aligns the
  wordmark with the hero) and is not reduced; the gap and the link that
  duplicates the wordmark's destination are what give. `e2e/public-discovery`
  asserts `scrollWidth === clientWidth` at 320/360/390.
- **A group of filter links needs `role="group"` + `aria-labelledby`.** The
  comps group them visually; a bare eyebrow above them conveys nothing to
  assistive tech, and the rail then reads as one flat run of 25 links with
  three different "All …" entries pointing at `/gigs`. `RailSection` owns this;
  `SiteFooter`, `ChainFilterChips` and `ListColumn` are the same pattern.
- **Every crawlable view declares `alternates.canonical`**, built from the same
  `gigsHref` normalisation the rail links use, so position keys and the default
  sort cannot mint a duplicate of a page that already exists.

### /foundations

`/foundations` is the visual companion to the token drift gate: the palette, the
type scale and every primitive in its real states. It is `noindex` and
deliberately **not** in the public nav (spec-correction #21) — go to the URL.

Nothing on it is hand-listed, and that is the rule to keep. Swatches come from
`schemePairs(colors.light)` and the type scale from `typeAtoms()`, the same
transforms `scripts/gen-web-tokens` runs to WRITE `styles/tokens.css` (the
scheme minus the omitted accent group; one `type-*` utility per mobile style),
so the page cannot show a colour or a size the app does not ship — #59 caught
it painting three blank swatches for a group the sheet no longer carried. The
controls are the shipped components, not restyled copies, so a variant
that regresses regresses here and one that is added and never wired up is
visibly missing. A hardcoded list on this page would be the single bug it exists
to prevent.

### Text a poster wrote

`title`, `description` and `city` are free text typed by a user and rendered on
an anonymous public page. A poster pasting a link into a title is ordinary, and
before this was handled it overflowed `/gigs` by **474px at 360px** — and still
30px at 1100px, because the card grid's track count changes what fits.

Containing it takes **two** things, and each is inert without the other:

1. `break-words` on the text, and
2. a `min-w-0` on the flex/grid **item** that contains it.

The second is the one that gets forgotten. `overflow-wrap: break-word` does not
reduce an element's *min-content* width, and a flex/grid item defaults to
`min-width: auto` — "never shrink below min-content" — so the item still sizes
to the longest unbreakable token and drags its track out. Adding `break-words`
alone was measured to change nothing at all.

Put `min-w-0` only where it is load-bearing and **verify by removing it**: on
this surface exactly one was (the feed card). The same class on the `<li>`, on
the workspace list's `<li>` and on the detail `<article>` was measured to make no
difference and is not shipped — a class that does nothing beside a comment
saying it matters is worse than no class.

Choose per surface between breaking and truncating: a feed card truncates its
place line (one line, scannable), the detail page breaks it (the reader is
deciding on that fact, and half a location is worse than two lines).

`e2e/public-discovery.spec.ts` asserts `scrollWidth === clientWidth` at
320/360/390 and at 768/900/1100/1280, against `unbreakableGig` — a fixture that
rides in the normal feed so every test sees it.

**It is not only a poster's text.** An email address the reader typed is echoed
back on the verify step, and it is just as unbreakable. `AuthPanel` had
`break-words` on its heading and not on its lede — and the lede is the slot the
address lands in, so the page scrolled to **595px at 320px** until the third
#14 review measured it. When a component takes free text in more than one slot,
the rule applies to every slot that can receive it, and the assertion belongs in
e2e (`auth-session.spec.ts`, "a long address does not drag the card off a 320px
screen") because a class-presence unit check cannot tell an effective
`break-words` from an inert one.

**Surface / selection contract** (`components/app/workspace/surfaces.ts`). The first
segment inside `(app)` is the *surface*; anything deeper is the *selection*. The detail
pane takes its accessible name from the surface and hands off focus when the selection
changes. **To give a surface a list column, add `app/(app)/@list/<surface>/page.tsx` —
nothing else.** `@list/default.tsx` renders nothing for the rest.

**A slot matches the WHOLE path, not a prefix.** `@list/chat/page.tsx` answers `/chat` and
nothing deeper, so `/chat/[userId]` needs `@list/chat/[userId]/page.tsx` of its own. Soft
navigation hides the omission completely — Next carries a slot's active subpage across one
— so the list looks fine until someone deep-links, reloads, or opens a shared URL and gets
the detail with no column beside it. Add the slot entry at **every depth the surface has**,
and assert the cold load, not the click.

**A remount is the normal case, so list state cannot live in the column.** Moving between
two slot entries tears the component down and builds it again — which happens on *every row
the reader opens*. Anything the column owns is therefore rebuilt from nothing, and the
column blinks: first through the skeleton, and (once the spinner is seeded away) through the
EMPTY state, which is a worse lie. Both were measured as
`["rows:1", "SKELETON", "rows:1"]` and `["rows:1", "rows:0", "rows:1"]`. Two fixes, by
data shape:

- data a **store** already owns (the inbox — the rail badge needs it whether or not a list
  is on screen): read the status off the store, and let the layout's realtime hook own the
  fetch. A column that fetches on mount also duplicates every request that hook makes.
- data a **paginated hook** owns (disputes, and every list #17-#19 adds): pass
  `usePaginatedList` a module-scoped `cache` so page zero outlives the hook. The whole
  first render is seeded from it, spinner included — the cache-hit branch runs in an
  effect, which is already a frame too late.

Assert it as `['rows:N']` across the navigation, not "the list is still visible": a
skeleton is visible too.

**And whatever outlives the component also outlives the SESSION.** Sign-out is a soft
navigation (`router.replace(ROUTES.root)` — the public feed at `/`), so one tab can switch
accounts without ever dropping the JS context — every store and every module-scoped cache
carries straight into the next session. Measured: the second account's inbox column listed
the first account's threads, and its disputes column listed their disputes. So `logout`
empties them, beside the notifications store it has always reset. **Register a
module-scoped cache in `lib/account-caches.ts`** rather than declaring one beside its hook;
a cache nobody can clear is a leak with a comment on it.

Testing that needs a stub that scopes rows to the CALLER. Ours did not — `handleChat`
served the seeded conversation to any bearer — so the first version of this test "passed"
on the fixture's behaviour and would have passed with the leak wide open. If a test asks
"can B see A's data?", check what the fixture answers B before believing the result.

Where a surface's list lives is also `surfaces.ts`'s job (`SURFACE_LIST_HOME`): a thread is
`/chat/<id>` but its list is `/messages`, so `/${surface}` would send the ≤900px back link
to a route that does not exist. That link is `[data-pane-back]`, and it is **CSS-gated, not
conditionally rendered** — which is a trap worth knowing: the default `display:none` and
the `@media (max-width:900px)` override have identical specificity, so whichever is written
LAST wins at every width. The default has to come first. It was written last, and the
affordance was invisible on every phone until #16 gave a surface a list column for "back"
to mean anything.

Two signals drive the collapse and they come from different places, deliberately:
whether a **list exists** is a DOM fact read by CSS `:has([data-list])` — it cannot be a
prop, because Next wraps parallel-slot output in boundary elements, so the `list` prop is
an element even when the slot renders nothing; whether a **row is selected** is a URL fact
passed as `hasSelection`. It is not "is a detail pane mounted" — the pane is always
mounted.

## Where API calls come from — the policy

**The Next.js server calls Fastify ONLY for the anonymous public GET surface**; everything
else goes **browser → Fastify directly**. Never add a Next API route that proxies Fastify.

| Caller | Calls | Why |
|---|---|---|
| Next server (RSC / `generateMetadata` / sitemap) | `GET /v1/gigs`, `GET /v1/gigs/:id`, `GET /v1/platform` — the only public endpoints | SEO/OG unfurls need real content in the HTML. The SSR fetch is anonymous by construction, so party-scoped fields cannot leak into crawler-visible pages. |
| Browser (client components) | Every authenticated call, all mutations, WebSocket, wallet signing | The JWT lives in `localStorage` (decision #5, like `apps/admin`) — the Next server never sees it, so it *cannot* make authed calls. `lib/ws.ts` dials Fastify's origin directly; signatures only exist in the browser. |

Consequences:
- Route protection is client-side (skeleton → redirect), like admin. No Edge middleware.
- A page can be both: `/gig/[id]` server-renders the anonymous listing, then the hydrated
  client refetches the same endpoint with the bearer to add the party-scoped half.
- Server components must never import wallet modules (`@walletconnect/core` touches `window`
  at import time). Wallet code sits behind a `client-only` dynamic boundary.
- CORS: the web origin belongs in `CORS_ORIGIN` (never `ADMIN_ORIGIN`).

## Pluggable seams — extend, never fork

- **Data access**: screens call `api/client/*` (via hooks/stores), never `fetch` directly.
- **Wallets**: new wallet transports implement the `WalletAdapter` interface and register in
  the adapter registry; nothing else changes.
- **Chains**: a new chain is a `CHAIN_MANIFEST` entry (+ server env secrets). Zero web code.
- **Balances**: per-chain readers plug into `wallet/balances/`.
- **Payout rails**: `@tenda/shared/fiat/payout/*` registry — never re-encode rail validation.
- **Display helpers**: a formatter used by 2+ clients (or encoding a product-wide display
  rule) lives in `@tenda/shared` — date/relative-time, money-display, countdown, chain-label,
  gig-display and fiat-display helpers moved there 2026-08-15; never copy one into `apps/web`
  (that copy is exactly how drift starts).
- **Brand facts**: every product string and outbound link (name, tagline, description,
  support/legal/social/store URLs, static fee copy) comes from shared `APP_INFO` — never
  typed inline. tendahq composes the same object; only release facts (version, apkUrl) stay
  in tendahq's file because scripts/check-app-version.mjs gates them there.
- **Auth methods**: driven by `GET /v1/auth/methods` + the challenge/verify orchestrator;
  adding a method is UI + config, never a bespoke flow.

## House rules (from /home/abioye/tenda/claude — enforced)

- Grep `packages/shared/src` before writing ANY helper/constant (12.3k LOC of behaviour).
- Max ~300 lines per file — split into folder + barrel. No `any`/`unknown` casts.
- No hardcoded values; amounts are base-unit strings — `BigInt`, never `Number()`.
- Tests co-located in `__tests__/`, positive AND negative cases, coverage >90 (the vitest
  coverage `include` list ratchets: porting a directory adds it there with its tests).
- `styles/tokens.css` is GENERATED (`pnpm gen:tokens`); never hand-edit, CI diffs it.
- **Text sizes are the generated `type-*` atoms, never `text-[Npx]`** (#63). An atom plus
  ONE override (`type-body-small font-semibold`, `type-title font-numeric`) is fine — the
  atoms sort before the core utilities, and `styles/__tests__/type-atoms.guard.test.ts`
  proves it on the compiled stylesheet. A pixel size that genuinely has no atom (an
  off-scale reading pair, a responsive heading, an 8/10/26/28px figure) goes in that
  test's register with a reason; anywhere else it fails the suite.
- `ConfirmDialog` for confirmations, toast for fire-and-forget — never `window.confirm()`.
- After changing shared: `pnpm --filter @tenda/shared build`.
