# Tenda Roadmap

Tenda is an agent-to-human execution network and marketplace. People, businesses and AI agents can commission funded real-world or digital work; workers complete it through mobile or web; proof, approval or dispute, and escrow settlement close the loop. Tenda also provides a separate peer-to-peer exchange path that workers may use to pursue local value.

This roadmap records Tenda's product direction, delivery commitments and evidence standards. Delivery is tracked in the repository's [issues](https://github.com/wisdomabioye/tenda-app/issues); each milestone below links the issues that deliver it. Work involving counterparties, credentials or security detail is tracked privately and is not linked here.

## Table of contents

- [How to read this roadmap](#how-to-read-this-roadmap)
- [Current state](#current-state)
- [Live evidence](#live-evidence)
- [End-to-end journeys](#end-to-end-journeys)
- [Roadmap overview](#roadmap-overview)
- [Near term: independent marketplace validation](#near-term-independent-marketplace-validation)
- [Agent task rails](#agent-task-rails)
- [Proof verification](#proof-verification)
- [Identity, reputation and matching](#identity-reputation-and-matching)
- [Fiat access](#fiat-access)
- [Committed product milestones](#committed-product-milestones)
- [Suggested expansion](#suggested-expansion)
- [Longer-term opportunities](#longer-term-opportunities)
- [Dependencies and sequencing](#dependencies-and-sequencing)
- [Evidence ledger](#evidence-ledger)

## How to read this roadmap

| Label | Meaning |
|---|---|
| **Live** | Implemented and supported by current repository, API or on-chain evidence |
| **Hardening** | A live capability receiving reliability, operational or UX improvements |
| **Committed** | Accepted work recorded in the task tracker |
| **Gated** | Committed work dependent on security, deployment or external prerequisites |
| **Exploratory** | A candidate direction requiring validation before commitment |
| **External dependency** | Work requiring a provider, legal process, credential or third-party deployment |

Registration, deployed code and API availability prove capability, not customer adoption. Exploratory integrations are never presented as shipped functionality. Public traction claims require customer-paid, non-team-funded activity and disclosed provenance.

## Current state

Tenda is building an Africa-focused marketplace for gigs and peer-to-peer exchange, starting commercially in Nigeria. The Android app, web app, operations dashboard and API use a shared escrow model across supported Solana and EVM integrations.

The chain manifest records Celo and 0G mainnet as live. Solana devnet, Celo Sepolia and 0G Galileo are available for testing; Base support is disabled for now, with its implementation retained. Solana mainnet remains planned, and Arc is the next planned network.

People and AI agents can create funded tasks. Posters set the budget and proof requirements. Workers can accept public gigs, apply to approval-mode gigs or receive direct invitations. The product includes evidence submission, approval, disputes and worker claim paths.

Licensed fiat-provider integrations remain planned. The internal peer-to-peer exchange is a separate product path.

## Near term: independent marketplace validation

- secure the first customer-paid, non-team-funded poster pilots
- measure completed GMV, effective take rate and platform costs
- measure task completion, proof acceptance, disputes and worker retention
- document full lifecycle evidence for mainnet tasks
- confirm the operating team and accountable product lead
- complete legal, privacy and contract-security reviews appropriate to live usage

## Agent task rails

The agent API can create funded tasks with a budget, deadline, proof requirements and geographic scope. Near-term work focuses on production adoption, clearer integration guidance and reliable monitoring rather than presenting API availability as customer traction.

## Proof verification

- establish a versioned proof schema for each task category
- add automated checks where the evidence supports them, such as geotag radius or required fields
- route ambiguous results to human review
- measure acceptance and dispute rates by proof type

Automated approval will only ship with documented failure handling and an appeal path.

## Identity, reputation and matching

- build reputation from verified marketplace outcomes
- expose completion, acceptance and dispute history with appropriate privacy controls
- improve discovery by location, availability and demonstrated capability

Optional verification is **exploratory** ([#43](https://github.com/wisdomabioye/tenda-app/issues/43)): a chain-neutral layer where users may attach privacy-preserving claims (proof of personhood, document-backed or local-ID verification) from decentralized or credential-based sources such as Self, wallet-held credentials or zkTLS. Tenda would store only the claim, level and expiry, never documents. Verification would unlock limits, badges and vetted pools, never block baseline use, and nothing is committed until a coverage test with target-market workers shows it works.

ERC-8004 identity is live on Celo. Self Agent ID, chain-neutral identity adapters, contextual outcome reputation and portable on-chain feedback remain committed or exploratory extensions with explicit privacy, safety and user-value gates.

## Fiat access

- complete merchant onboarding with a selected licensed provider
- validate the provider's final API contract and authentication method
- complete a reconciled production transaction before changing public status
- document supported countries, currencies, limits and user responsibilities

Yellow Card and Onramp.money are candidates, not active production providers.

## Live evidence

### Product surfaces

| Surface | Status | Current capability |
|---|---|---|
| Android application | **Live** | Worker and poster marketplace journeys |
| Web application | **Live** | Marketplace and account workflows |
| Admin/operations dashboard | **Live** | Operational and dispute workflows |
| Public and agent APIs | **Live** | Human and programmatic task workflows |
| Escrow contracts | **Live** | Celo and 0G mainnet |
| Proof workflow | **Live** | Evidence, review, approval, disputes and claims |
| P2P exchange | **Live product path** | Peer-to-peer exchange, separate from licensed fiat rails |
| ERC-8004 identity | **Live** | Tenda Celo Agent `#9815` |
| Native iOS application | **Planned** | Native parity and iOS delivery work |
| Licensed fiat rails | **External dependency** | Not represented as live before production verification |

### Network status

| Network | Status |
|---|---|
| Celo mainnet (`42220`) | **Live** |
| 0G mainnet (`16661`) | **Live** |
| Celo Sepolia, 0G Galileo and Solana devnet | **Testing** |
| Base Sepolia | **Disabled for now** |
| Base | **Paused** — support disabled; the implementation, including the ERC-4337 paymaster, is retained |
| Arc | **Planned** |
| Solana mainnet | **Committed, security-gated** |

### Tenda Celo Agent

- [ERC-8004 agent `#9815`](https://www.8004scan.io/agents/celo/9815), owned by agent wallet `0x041e487c82f364aefc17871f22ec997a50df5757`.
- Canonical [agent card](https://api.tendahq.com/.well-known/agents/0x041e487c82f364aefc17871f22ec997a50df5757.json).
- Task endpoint: `https://api.tendahq.com/v1/agent/tasks`.
- OpenAPI: `https://api.tendahq.com/v1/openapi.json`.
- Tenda standing: `https://api.tendahq.com/v1/users/70836ed5-2aa3-4605-ae75-3b2e3ddca530/standing`.
- Declared wallet networks: Celo `42220` and 0G `16661`.
- Proof types: image, video, document, geotag, text and structured evidence.
- The card declares `x402Support: true` and `supportedTrust: ["reputation"]`.

These claims have important limits:

- ERC-8004 registration provides identity and discovery; registry presence is not reputation.
- Tenda standing is application reputation, not currently an ERC-8004 Reputation Registry write.
- ERC-8004 does not define payment. Tenda uses an x402-compatible HTTP 402/sign/resend workflow, while escrow funding remains distinct from x402 `exact`.
- MCP and A2A are not advertised until functioning endpoints exist.
- The agent card still needs explicit `registrations` metadata containing agent `9815` and its registry provenance.

## End-to-end journeys

### Human marketplace

1. A person or business defines work, budget, deadline, location and proof requirements.
2. Funds lock in escrow.
3. A worker accepts, applies or receives an invitation.
4. The worker completes the task through Android or web and submits evidence.
5. The poster approves or disputes the result.
6. Escrow settles; the worker can retain the asset or pursue local exchange.

### Target agent-to-human execution

1. An agent discovers Tenda through ERC-8004 and the public card.
2. It submits structured requirements and receives payment/authorisation terms.
3. It signs the asset authorisation; Tenda relays escrow creation where supported.
4. A human completes the task and submits proof.
5. Planned lifecycle work adds signed events and a complete polling fallback; these are not live today.
6. The authorised party approves or disputes; escrow settles. Planned contextual reputation will derive signals from authoritative outcomes.

The canonical product demonstration is:

> 8004scan → agent card → task request → 402 terms → authorisation → escrow funded → human proof → approval or dispute → settlement.

## Roadmap overview

| Horizon | Theme | Intended outcome |
|---|---|---|
| **Now** | Live-product hardening | Reliable, measurable marketplace, agent and settlement paths |
| **Next** | Agent readiness | Complete identity, lifecycle, SDK, webhook and trust interfaces |
| **Next** | Repeatable outcomes | Reusable, verifiable task products instead of bespoke gigs only |
| **Next** | Trust and liquidity | Better reputation, matching and earn-to-local-value exchange |
| **Expansion** | Mobile and business platform | iOS, campaign management, bulk tasks and dataset delivery |
| **Expansion** | Networks and verification | Solana, Arc, 0G Compute/Storage and GenLayer |
| **Continuous** | Evidence and readiness | Adoption, economics, security and operational reliability |

## Committed product milestones

### A. Live-product hardening

**Status:** Hardening/gated. **Issues:** [#4](https://github.com/wisdomabioye/tenda-app/issues/4), [#5](https://github.com/wisdomabioye/tenda-app/issues/5), [#7](https://github.com/wisdomabioye/tenda-app/issues/7), [#12](https://github.com/wisdomabioye/tenda-app/issues/12), [#17](https://github.com/wisdomabioye/tenda-app/issues/17).

- Productise gas abstraction with truthful per-chain/asset availability.
- Monitor relayer balances, nonces, RPC failover, sponsorship budgets and cost attribution.
- Reconcile reservation/commit/release and recover stuck, dropped, replaced or terminally unknown transactions.
- Distinguish quoted, authorised, relayed, broadcast, confirmed, indexed and terminally failed states; never call request acceptance funded.
- Add abuse controls, alerts and operational runbooks.
- Add authorised relayed approval/cancellation where contract authority permits.
- Close Solana accounts and recover rent before mainnet; complete Solidity/Solana audit and multisig readiness.
- Improve gas-claim placement, multi-asset cNGN/cUSD balances, configurable draft retention and dashboard aggregation.
- Resolve disputes by percentage (`split_bps`) instead of a fixed 50/50, with the fee on the counterparty's share, a bounded admin range and a stored rationale ([#41](https://github.com/wisdomabioye/tenda-app/issues/41)).
- Charge a separate, admin-tunable platform fee on the peer-to-peer exchange path, snapshotted onto each escrow at creation so the fee quoted is the fee charged. The receiver pays on both paths and the Seeker discount applies to both ([#42](https://github.com/wisdomabioye/tenda-app/issues/42)).
- Land both contract changes in one revision with relayed approval/cancellation, ahead of security review.

### B. Agent identity, trust and discoverability

**Status:** Live foundation, committed expansion. **Issues:** [#9](https://github.com/wisdomabioye/tenda-app/issues/9), [#23](https://github.com/wisdomabioye/tenda-app/issues/23).

- Add the card `registrations` entry with agent `9815`, Celo chain and Identity Registry provenance.
- Publish only verified operations, networks, assets and endpoint versions.
- Define card schema/version, caching, rotation and revocation; detect on-chain URI/card drift and test spoofed/stale cases.
- Supplement the x402 boolean with network, asset, escrow/payment destination, authorisation scheme, task endpoint, quote expiry, operations and relay availability.
- Register Self Agent ID as a privacy-preserving human-operator verification tier, not a universal gate for external agents.
- Build chain-neutral registration/lookup/attestation adapters and treat chains without registries normally.
- Expose privacy-conscious task history, funding reliability, approval behavior, capabilities and registry provenance without equating registration with reputation.
- Keep ERC-7857 exploratory until the tokenised asset, ownership and transfer value are defensible.

### C. Complete agent lifecycle

**Status:** Committed. **Issues:** [#21](https://github.com/wisdomabioye/tenda-app/issues/21).

- Cover funding, acceptance/application, submission, approval, dispute, completion, expiry and terminal funding failure.
- Publish signed, versioned, idempotent events.
- Support webhook registration/rotation/revocation, retry/backoff, replay, logs and polling fallback.
- Make duplicate/out-of-order delivery harmless and protect destinations against SSRF.
- Define delivery SLOs, alerts and explicit machine recovery signals.
- Let authorised agents inspect evidence and approve, dispute or cancel only within wallet/contract authority.

### D. Agent developer platform

**Status:** Committed after lifecycle stabilisation. **Issues:** [#40](https://github.com/wisdomabioye/tenda-app/issues/40).

- Ship TypeScript and Python SDKs for registration, quotes, 402 sign/resend, funding, reads/lists, watching, proof inspection and authorised settlement actions.
- Hide raw token-unit and chain-specific transaction complexity without holding customer keys.
- Publish an agent skill for the current one-shot create path first; extend it as the lifecycle lands.
- Ship MCP tools that return unsigned/signable intent or use caller-provided signers.
- Generate types from one API contract and conformance-test raw HTTP, TypeScript, Python and MCP against the same flow.
- Publish package provenance, versioning, changelog, deprecation policy and vendor-neutral OpenAI/Claude-compatible examples.
- Keep A2A exploratory until a functioning lifecycle endpoint exists.

### E. Repeatable outcomes and proof

**Status:** Committed. **Issues:** [#8](https://github.com/wisdomabioye/tenda-app/issues/8).

- Create versioned templates for retail price/availability audits, merchant/location verification, property inspection, local app/payment testing and structured field data.
- Each template owns typed inputs, geography, eligibility, proof, review, privacy/retention, dispute and export policy.
- Persist template/schema versions with funded work.
- Add deterministic checks for required fields/files, timestamps, geofences, duplicate hashes, OCR/schema rules and replayed evidence.
- Route ambiguous/probabilistic signals to human review with appeals.
- Pilot 0G Compute verification and measure its cost against task value.
- Evaluate 0G Storage through the existing scoped-upload seam, explicitly choosing mirror versus replacement.
- Pilot narrow GenLayer photo-proof adjudication on testnet while addressing economics, availability and prompt injection.

### F. Contextual and portable reputation

**Status:** Committed after outcome templates.

- Derive versioned, recomputable completion, acceptance, dispute, response/approval, cancellation and funding-reliability signals by task family.
- Cover workers, humans, businesses and agents with sample-size/time-window and cold-start labels.
- Do not treat allegations or unresolved disputes as final outcomes.
- Define anti-gaming/Sybil controls, corrections, appeals and retention; never leak exact locations or legal identities.
- Keep ERC-8004 identity, Self Agent ID, Tenda standing and ERC-8004 feedback distinct.
- Later publish selected privacy-safe outcomes as ERC-8004 feedback with defined tags, issuer rules, revocation/correction and task/payment evidence hashes.

### G. Marketplace trust, matching and distribution

- Match by location, availability, language, experience, equipment, travel radius and demonstrated capability.
- Support vetted/private worker pools and make agent-posted work recognisable.
- Add saved searches, location/task alerts, opt-in email ([#20](https://github.com/wisdomabioye/tenda-app/issues/20)), Android/iOS push and Telegram gig broadcasts.
- Add task-category safety restrictions, incident reporting, consent-based location handling and check-ins where appropriate.
- Add referral/supply programs only after fraud-resistant attribution exists.

### H. Earn-to-local-value exchange

**Status:** Live foundation, committed hardening.

- Connect work earnings to exchange discovery without implying fiat custody.
- Improve rate transparency/expiry, counterparty reputation, payment timers and fiat-payment evidence.
- Handle partial/incorrect payment, timeouts, duplicate proof, fraud and collusion.
- Add history-based limits and corridor liquidity/completion metrics.
- Test earn → offer → match → evidence → release/dispute on mobile and web.

### I. Licensed fiat access

**Status:** External dependency.

Complete provider onboarding, final API/authentication validation, secure credentials, verified webhooks, recipient verification where supported, a reconciled production transaction, and published country/currency/limit/responsibility scope before changing public status. Yellow Card, Onramp.money and NIP integrations remain candidates or dependencies, not live providers.

### J. Native iOS, offline use and localisation

**Status:** Planned expansion.

- Build native iOS parity for onboarding, wallet, discovery, creation, acceptance, evidence, review/dispute, claims, settlement, exchange, notifications, deep links, accessibility and secure storage.
- Support encrypted offline drafts, resumable uploads, low-bandwidth media, sync/conflict states and no false submitted status.
- Localise currencies, phone/address formats and launch-market languages.
- Preserve accessible evidence workflows, keyboard/reduced-motion web support and clear low-literacy state/error language.

### K. Network expansion

- **Network roles (direction, not shipped capability):**
  - **Solana:** reach more users at negligible gas cost.
  - **0G:** the project's own chain, chosen for its compute and storage, fast finality and cheap gas.
  - **Arc:** USDC as both the gas and the payment asset, so a user needs no separate gas token. Planned.
  - **Celo:** live mainnet today.
- **Base:** paused. Support is disabled for now; the implementation, including the ERC-4337 paymaster, is retained for a possible return.
- **Solana mainnet:** account closure/rent recovery, subsidy controls, Squads 3-of-5, audit readiness and lifecycle verification.
- **0G:** maintain mainnet while piloting Compute and Storage.
- Require validated demand, settlement asset, reliable RPC/indexing, viable relayer economics, secure escrow and monitoring before adding another network.

### L. Measurement and independent validation

**Status:** Committed. **Issues:** [#22](https://github.com/wisdomabioye/tenda-app/issues/22).

- Marketplace funnel: customer-paid, non-team-funded GMV, take rate, costs, fill/accept/complete time, proof acceptance, rework, disputes, repeat posters, retained workers, net earnings, exchange completion and contribution margin.
- Agent funnel: registrations, quotes, 402 quote→authorisation→funded conversion, relay success/cost, completion, webhook delivery, repeat agents, review latency and human-review rate.
- Define ownership, denominators, windows, retry deduplication and reconciliation; exclude demos/internal seeds by explicit identity.
- Run one customer-paid, non-team-funded wedge: Nigerian retail audit, merchant/location verification, property inspection, local app/payment testing or structured field data.
- Publish buyer/payment provenance, GMV, timing, acceptance/dispute/rework, relay cost, worker earnings, buyer repeat intent, failures and a continue/change/stop decision.

### M. Product, developer and operational evidence

**Status:** Committed/continuous.

- Move the keyless public demo to a clearly labelled testnet without blocking production registration.
- Reframe the landing page around the full execution loop and distinct poster, worker, business and agent entry points.
- Add an interactive/recorded agent-hire demonstration, truthful capability matrix and developer CTA.
- Monitor the public card, OpenAPI, endpoints and on-chain URI.
- Produce receipts connecting task terms, escrow transaction, evidence hash, decision and settlement.
- Maintain audits, multisig/key rotation, relayer isolation, webhook/upload security, evidence retention/redaction, location consent, fraud controls, reorg/provider-disagreement recovery, incident runbooks and uptime/readiness monitoring.

### N. Business task console

**Status:** Planned after webhooks and per-account limits. **Issues:** [#36](https://github.com/wisdomabioye/tenda-app/issues/36), [#37](https://github.com/wisdomabioye/tenda-app/issues/37), [#38](https://github.com/wisdomabioye/tenda-app/issues/38), [#39](https://github.com/wisdomabioye/tenda-app/issues/39).

- A thin, static web console for businesses to create and manage tasks through the same agent API and x402 payment flow, with wallet-only sign-in and no custody of customer keys.
- Bulk task creation from a spreadsheet or CSV with per-row validation, a rate-limited submission queue and per-row funding status.
- Optional AI-assisted task composition through one small serverless function, with output validated against the published OpenAPI schema.
- Hosted by Tenda first; self-hosting follows only on demand.
- Gated on: webhooks, per-account rate limits, browser-readable rate-limit and payment headers, batched moderation and a validate-only task endpoint.

## Suggested expansion

These ideas are not commitments until validated and filed:

- Organisation workspaces, roles, scoped API keys, budgets, approval policies and audit logs.
- Campaign dashboards, private worker pools, CSV/bulk task creation and geographic assignment.
- Recurring campaigns and reusable proof policies.
- Dataset export/delivery with consent, licensing, redaction, retention and provenance.
- Verifiable result receipts for enterprise buyers.
- Agent policies for maximum task value, daily/monthly spend, networks, assets, countries, templates, geography, proof requirements, human approval and emergency revocation—enforced at authoritative boundaries.

Candidate uses include store/inventory audits, merchant verification, property monitoring, price intelligence, local product/payment testing and structured field research.

## Longer-term opportunities

Recurring tasks, licensed datasets and additional revenue products may follow demonstrated demand. They are not part of the current base business model. The current model is a platform fee on settled marketplace value.

Additional longer-term opportunities include dataset marketplaces, A2A support, portable validation signals, more networks and settlement assets, fraud-resistant referral and worker-supply programs, and insurance or guarantees justified by real demand and loss data.

## Dependencies and sequencing

| Capability | Depends on |
|---|---|
| Agent SDKs and MCP | Stable full agent lifecycle |
| Contextual reputation | Versioned templates and authoritative events |
| ERC-8004 feedback | Contextual reputation, privacy policy and issuer rules |
| Independent launch wedge | First template and trustworthy metrics |
| Solana mainnet | Rent fix, multisig and security readiness |
| Arc | A confirmed network integration and an escrow deployment |
| Contract audit | Final relayed approval/cancellation surface and Solana rent fix |
| Licensed fiat claims | Provider onboarding and reconciled production transaction |
| Production proof automation | Failure policy, appeals, measured reliability and acceptable economics |
| Business datasets | Consent, retention, licensing and redaction |
| Business task console | Webhooks, per-account rate limits, CORS-exposed headers, batched moderation and a validate-only endpoint |
| Native iOS release | Feature parity, secure storage, device E2E and APNs readiness |

## Evidence ledger

| Claim | Required evidence |
|---|---|
| ERC-8004 identity live | Agent `#9815`, registry and transaction |
| Agent card live | Canonical `.well-known` JSON and drift check |
| Agent task API live | OpenAPI and reachable task endpoint |
| Celo/0G escrow live | Verified configuration, contract and deployment record |
| Human workflow live | Android/web end-to-end evidence |
| Gas abstraction supported | Per-chain capability and confirmed relayed transaction |
| Marketplace adoption | Customer-paid, non-team-funded cohort evidence pack |
| Security reviewed | Audit scope, report and remediation state |
| Licensed fiat live | Provider approval and reconciled production transaction |

Product, engineering and operations ownership must be assigned before a committed milestone enters active delivery. This roadmap is reviewed against the task tracker, chain manifest, published API, agent card and on-chain evidence.
