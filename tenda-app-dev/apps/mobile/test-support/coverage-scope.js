/**
 * What the coverage gate measures — the allow-list itself, extracted from
 * jest.config.js in #75 when gating the harness took that file past the
 * 300-line house rule.
 *
 * A long register with its provenance written down belongs in its own module;
 * its sibling coverage-ungated.ts sits here for the same reason. jest.config.js
 * keeps the thresholds and the runner settings, which is what a reader opens
 * it for.
 *
 * COMMONJS AND `.js`, deliberately: jest reads its config before any transform
 * is available, so the config cannot `require` a `.ts` file. That also puts
 * this module outside `test-support/*.ts` and therefore outside the coverage
 * gate — correct rather than unfortunate, since it is an array of strings with
 * nothing to execute. The behaviour that matters is asserted anyway:
 * __tests__/coverage-gate.test.ts reads `config.collectCoverageFrom` and fails
 * on a pattern that matches nothing.
 */

/**
 * An ALLOW-LIST: a file that is not matched here contributes nothing to the
 * figures the gate reports, however well tested it is. That is deliberate —
 * mobile has screens and native-adjacent modules impractical to cover, and a
 * catch-all pattern over every ts/tsx file would drop the global far under
 * 90 and force a threshold cut, which is a worse number than an honest
 * narrow one.
 *
 * What is NOT deliberate is a file quietly staying outside it. #49, #51 and
 * #56 each found one by accident. __tests__/coverage-gate.test.ts now fails
 * when a suite lands on an unlisted module, and the register in
 * `coverage-ungated.ts` beside this file records the ones that are outside it
 * today. That list cannot grow without someone editing it in a reviewed diff.
 *
 * No count is quoted for that register here, on purpose: this paragraph used to
 * say "the 109", the register holds 108, and a number in prose that nothing
 * checks drifts exactly like that (#75).
 *
 * The same test also fails on a pattern here that matches NOTHING. #58 found
 * seven, every one of them a module that had moved into @tenda/shared with
 * its pattern left behind — the failure mode to expect, since a module
 * leaving the app looks exactly like a module that was never listed.
 *
 * Before adding a file here, MEASURE with it listed. Every entry below that
 * says "measured" earned it that way — and re-measure before trusting one,
 * because stores/realtime.store.ts sat out of the gate on a reading that had
 * stopped being true.
 */
module.exports = [
  // The notification centre: the feed store and the screen that reads it.
  // Added in #57 with the cases that fix the empty-state blink; measured
  // before listing, and the gate holds (branches 90.57 -> 90.46, still above
  // the 90 threshold) with the store at 97.91 and the screen's refresh and
  // end-reached paths now driven rather than left dark.
  'stores/notifications.store.ts',
  'app/notifications/index.tsx',
  // The open-thread register and the read-sync debounce (#56). Added with its
  // first suite; measured before listing, and it RAISES the gate (branches
  // 90.46 -> 90.57).
  'hooks/useChatRealtime.ts',
  // Its sibling, added in #58 after RE-measuring. #56 left this file out on
  // a measurement of 89.96% branches against a threshold of 90, and #58
  // seeded it into the ungated register on the strength of that number. The
  // number had gone stale: #57 raised the branch floor, and gating this file
  // now reads 90.21 — it holds. Recording the reason and then not re-taking
  // the measurement is how an exemption outlives its cause.
  //
  // The file itself is 72.72 / 70.45 / 73.68 / 74.07: its chat half is
  // covered and its escrow, gig-feed, notification and connection channels
  // are not, so the 0.21 of headroom here is genuinely thin. #70 is the task
  // that widens it — filed off this file's uncovered lines, which only
  // became visible once it was gated. Until it lands, a change that costs
  // more than 0.21 of branch coverage fails the gate, which is the gate
  // working.
  'stores/realtime.store.ts',
  // The optimistic-send state machine (#59). It had no suite at all and sat
  // outside this list too, so both halves of #58's problem applied to the
  // trickiest state in the app. Measured before listing: the file reads
  // 100/100/100/100 and the global branch figure goes UP, 90.21 -> 90.57.
  'stores/chat.store.ts',
  // The budget field: fiat/asset entry, the rate-arrival conversion (#49) and
  // the base-unit string it emits. Added in the #49 re-audit — the task gave
  // it a 17-case suite and left the file outside this allow-list, so none of
  // those cases could move the number. Including it costs nothing: the file
  // measures 100/97.5/100/100, its one uncovered branch being a Pressable's
  // press-state opacity. (95 branch until #66 covered the unknown-asset
  // symbol fallback.)
  'components/form/PaymentInput.tsx',
  // Its money, split out when #66 took the component past 300 lines: the two
  // fiat<->base-unit converters, the rate derivation, and the effect that
  // restates the field when the denomination changes. Measured before
  // listing, per the rule above: 100/100/100/100, and the global figures went
  // UP — statements 92.4 -> 92.53, branches 90.81 -> 91.04 (measured with the
  // line removed and restored, not recalled).
  'components/form/payment-input/payment-input.fiat.ts',
  'wallet/**/*.{ts,tsx}',
  'stores/auth.store.ts',
  'app/(auth)/connect-wallet.tsx',
  'app/settings/linked-wallets.tsx',
  '!wallet/**/*.d.ts',
  // Message-attachment feature (chat + dispute).
  'lib/attachments.ts',
  'lib/media-download.ts',
  'hooks/useAttachmentUpload.ts',
  'components/shared/AttachSheet.tsx',
  'components/shared/media/AttachmentPreview.tsx',
  // Proof→media boundary (#14): filters data proofs off the media surfaces.
  'components/shared/media/file-proofs.ts',
  // Notification permission flow (primer tiers + throttled nudge).
  'lib/notifications/*.ts',
  // Pure re-export barrel, nothing to exercise.
  '!lib/notifications/index.ts',
  'stores/notification-prompt.store.ts',
  'stores/notification-permission.store.ts',
  'hooks/useNotificationPermission.ts',
  'hooks/usePushToken.ts',
  'components/notifications/NotificationPrimer.tsx',
  'components/notifications/NotificationPrimerHost.tsx',
  'components/notifications/NotificationNudgeBanner.tsx',
  'components/notifications/primerCopy.ts',
  // Pagination + chain filter (feed / order book / my gigs / my trades).
  // `lib/pagination/*.ts` and its index exclusion headed this block until
  // #58: 623a79c moved that directory to packages/shared/src/pagination,
  // where shared's own suite covers it, and both patterns had been matching
  // nothing here ever since.
  'hooks/usePaginatedList.ts',
  // The hook's two extracted halves (#54). Listed explicitly because the
  // gate is an allow-list: splitting a covered file into an unlisted folder
  // silently REMOVES its code from the measurement, and the parent then
  // reports a better number for doing less — measured, usePaginatedList.ts
  // read 100/100/100/100 with the branchy half no longer inside it.
  'hooks/pagination/*.ts',
  // Types only, nothing to exercise.
  '!hooks/pagination/paginated-list.types.ts',
  'hooks/useDebouncedValue.ts',
  'hooks/useGigsFeedPolling.ts',
  'hooks/useHomeFeed.ts',
  'features/gig-feed/*.ts',
  '!features/gig-feed/index.ts',
  'hooks/useMyGigs.ts',
  'hooks/useMyDisputes.ts',
  'hooks/useExchangeScreen.ts',
  'components/ui/PaginatedList.tsx',
  'components/gig/GigListSkeleton.tsx',
  'components/filters/*.tsx',
  'components/navigation/PagerTabBar.tsx',
  // MB1/MB2: server-backed wallet totals + profile counts.
  'hooks/useWalletScreen.ts',
  'hooks/useProfileStats.ts',
  // Live moderation hints while composing a gig. Web's twin has been covered
  // since S6; this one had no suite at all until #51, so it was invisible
  // here too — a gate that cannot see a file cannot report it regressing.
  'hooks/useModerationPreview.ts',
  // Stage 10: gig acceptance modes. The CTA branch resolution is the part
  // that matters — it is where the mode-blind "Accept Gig" bug lived, and it
  // is pure, so it is covered directly rather than through eight renders.
  'components/gig/gig-cta/*.{ts,tsx}',
  // A `gig-cta/branches/*.ts` entry sat here until #58. 686cb76 deleted that
  // directory when mobile started consuming the shared S4.0 modules, so the
  // pattern had been matching nothing since.
  '!components/gig/gig-cta/index.ts',
  '!components/gig/gig-cta/types.ts',
  'components/gig/GigCTABar.tsx',
  // The whole approval surface, not a hand-picked list of it: naming files
  // individually is how ApplicantList, ApplicantRow, ApplySheet and
  // MyApplicationCard sat at 0% while the folder reported healthy numbers.
  'components/gig/gig-applications/*.{ts,tsx}',
  '!components/gig/gig-applications/index.ts',
  'components/gig/gig-form/{AcceptanceModePicker,ComposerWalletNotice}.tsx',
  // The fact card, its rows, the sheet host and its upload half, all
  // 100/100/100/100. Braced onto one line: this register is AT the 300 limit.
  'components/gig/GigMetaInfo.tsx',
  'components/gig/gigMetaRows.ts',
  'components/gig/GigActionSheets.tsx',
  'components/gig/gig-action-sheets/{ProofUploadSheet.tsx,upload.ts}',
  // #15 data proofs: worker capture UI, composer param editors, payload list.
  'components/gig/{gig-action-sheets/data-proofs,gig-form/proof-params}/*.tsx',
  '{components/shared/DataProofList.tsx,hooks/useDeviceCoords.ts}',
  // The read-back the on-chain digest is taken over. Measured before listing.
  'features/escrow-proofs/attachedProofUrls.ts',
  'components/ui/Input.tsx',
  // #59: the card and the eyebrow got their first suites when their literals
  // (radius 18, the eyebrow's four numbers) became tokens the other clients read.
  'components/ui/{Card,Eyebrow}.tsx',
  // The money primitive. Its first suite came from the font-registration audit,
  // which found the headline naming a 500/600 face while declaring weight 700.
  'components/ui/MoneyText.tsx',
  // The wallet headline and the lifetime stats. Their first suite came with the
  // unknown-asset work: `amountRawToDisplay` now answers null rather than raw
  // base units, and these two render the largest numbers in the app.
  'components/wallet/WalletHeroCard.tsx',
  'components/wallet/EarningsSummary.tsx',
  // The escrow detail screens' shared TransactionMonitor wiring, extracted from
  // the two hubs that had duplicated it. It owns the re-read-on-failure the
  // proof retry depends on, so it is gated rather than left to the hubs (which
  // no suite renders). Measured before listing: 100/100/100/100.
  'components/escrow/EscrowTransactionMonitor.tsx',
  // The three feed-card variants. All three sat in the ungated register — a
  // measured exemption: their display ternaries (deadline tone and glyph,
  // remote vs on-site, cross-border, showStatus, priced vs unpriceable asset)
  // were each driven on ONE arm, so gating them cost 92 -> 89.31 global
  // branches, under the 90 floor. `display-branches.test.tsx` drives the other
  // arms; re-MEASURED with them listed, and the gate now HOLDS — the three
  // files read 100 stmts / 85.03 branch / 100 funcs / 100 lines, and the global
  // figures go 93.18/91.94/92.57/93.27 ungated to 93.33/91.47/92.75/93.41
  // gated. Branches pay 0.47 for statements gaining 0.15; both stay well clear
  // of the 90 floor. What is still dark is the `pressed` style arms and the
  // success-tone deadline chip.
  'components/gig/GigCardCompact/*.{ts,tsx}',
  // A re-export barrel plus a variant switch no suite renders directly.
  '!components/gig/GigCardCompact/index.tsx',
  // A pure re-export barrel — three `export ... from` lines and no logic. Its
  // sibling `amount.ts` DOES hold logic and is gated by the pattern above,
  // exercised through all three variants.
  '!components/gig/GigCardCompact/shared.ts',
  // The theme's font declarations and the assets they name. Both are data, and
  // the seam between them is exactly where JetBrains Mono went missing for
  // months — an unregistered family does not error, it silently renders as the
  // platform sans. Measured before listing, per the rule above: both read
  // 100/100/100/100 and the global figures are unmoved.
  'theme/fonts.ts',
  'theme/tokens.ts',
  'hooks/escrow/proof-hash.ts',
  'features/escrow/transition-failure.ts', // 100/100/100/100
  'components/gig/GigDetailGate.tsx',
  'components/shared/ReviewScore.tsx',
  // The counterparty card, gated with its first suite (#19: the agent badge).
  // Measured before listing: the file reads 77.77 / 60.86 / 66.66 / 77.77 (the
  // message press is the dark part) and the global thresholds hold at
  // 94.36 / 93.29 / 93.76 / 94.51.
  'components/shared/PersonCard.tsx',
  // The review row, gated with its FIRST suite (#38) — it had no tests at all.
  // Measured before listing: 100/100/100/100.
  'components/shared/ReviewCard.tsx',
  'stores/gigs.store.ts',
  // CO1 takedown enforcement: the hooks that act on a refusal, where the
  // server is the first to know a listing was pulled and the screen has to
  // be told by its own failure.
  //
  // `lib/detail-load-error.ts` and `lib/takedown-refusal.ts` headed this
  // block until #58. Both were deleted in 686cb76 as superseded local copies
  // of shared modules; neither pattern had matched anything since.
  'components/gig/gig-applications/useApplications.ts',
  'hooks/useExchangeDetail.ts',
  'components/ui/NoticeBanner.tsx',
  'components/reputation/RestrictionBanner.tsx',
  'components/escrow/takedown/*.{ts,tsx}',
  '!components/escrow/takedown/index.ts',
  'components/exchange/ExchangeCTA.tsx',
  // Dispute mediation. Named as WHOLE folders, not a hand-picked list: the
  // thread screen sat at 0% while its neighbours reported healthy numbers,
  // which is how a mediator seeing both disputants under one name shipped.
  'app/dispute/*.tsx',
  'components/dispute/*.{ts,tsx}',
  // `lib/dispute-thread.ts` (moved to shared in 623a79c) and
  // `lib/dispute-send-error.ts` (deleted in 686cb76) were listed here and
  // had been matching nothing since (#58).
  'hooks/useDisputeThread.ts',
  // The other half of that guard: app.config.ts decides what reaches getEnv,
  // and a `?? 'development'` default there makes the missing-APP_ENV branch
  // unreachable. Gated because the coupling is the bug — measured with it
  // listed and the global thresholds hold (93.19 / 92 / 92.51 / 93.24). The
  // file itself reads 100 stmts / 66.66 branch / 100 funcs / 100 lines; the two
  // uncovered branches are unrelated optional-config ternaries — line 3's
  // EXPO_PUBLIC_API_URL and line 145's GOOGLE_IOS_URL_SCHEME plugin. Neither is
  // what #128 gated this file for, and neither is worth a fixture that only
  // exists to colour a line green.
  'app.config.ts',
  // Which API host the binary talks to, and the guard that is supposed to shout
  // when that was never decided. Listed with its first suite in #128 — the
  // module had none, which is how it came to call an APP_ENV that WAS set "not
  // set", and how the same conflation survived being ported to web (#127).
  // Measured with it listed: 100/100/100/100, so it moves the global figures up
  // rather than down.
  'lib/env.ts',
  // Build identity. Small, but it is the surface that spent months telling
  // users the app was v1.0.0 when it had never been.
  'lib/app-version.ts',
  'components/ui/AppVersion.tsx',
  // Escrow convergence. Include the orchestration itself so tests cannot
  // pass by merely asserting mocked callbacks around the former race.
  'hooks/escrow-sync/*.ts',
  '!hooks/escrow-sync/index.ts',
  '!hooks/escrow-sync/types.ts',
  'hooks/escrow-live/*.ts',
  '!hooks/escrow-live/index.ts',
  // `lib/escrow-sync.ts` was listed below this line. 623a79c moved it to
  // packages/shared/src/utils, which grew its own suite for it in the same
  // commit; the mobile pattern stayed and matched nothing (#58).
  // The per-chain balance rows (#64). Added with their first suite: the
  // component printed '0 USDC' for a chain it had NO reading for, which is
  // the conflation web's grid has always avoided. Measured before listing —
  // the file reads 100/100/100/100 and every global figure went up.
  'components/wallet/WalletBalanceRows.tsx',
  // The signer preview and its hook. Both 100/100/100/100.
  'components/wallet/{SigningWalletRow,sell/SellWalletNotice}.tsx',
  'hooks/wallet/useSigningWallet.ts',
  'components/feedback/TransactionMonitor.tsx',
  // The gate's OWN machinery (#75). These three decide what everything above
  // is measured against, and until now nothing measured THEM: the resolver has
  // a 19-case suite, but that suite sits directly under the app root, so its
  // owner directory is '.', the resolver cannot resolve itself as a subject,
  // and the "every subject is gated" rule never asked. The gate grading its
  // own homework.
  //
  // Measured before listing, per the rule above: all three read
  // 100/100/100/100. They do NOT move the app's figures: jest.config.js gives
  // './test-support/' its own threshold, which SUBTRACTS these from the global
  // ones. The reasoning, and the measurement behind it, are recorded there.
  'test-support/*.ts',
  // The settings store, which gained its first suite with #88. It reads theme
  // and currency back out of SecureStore, and the currency it admits is what
  // every CURRENCY_META lookup downstream indexes with — an unlisted one throws
  // on the next property read rather than merely displaying oddly, so the
  // parsing is worth measuring.
  'stores/settings.store.ts',
]
