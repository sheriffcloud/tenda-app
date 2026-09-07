/**
 * Files the unit suite exercises that the coverage gate cannot see — the
 * recorded, shrinking exception list behind __tests__/coverage-gate.test.ts.
 *
 * WHY A LIST AND NOT A RULE. #58 asked for "every tested file must be in the
 * gate". Enforced literally that breaks the build on changes that strictly ADD
 * tests: a file can gain its first suite and still be too thinly covered to
 * carry the global threshold. `stores/realtime.store.ts` was the worked
 * example when #56 measured it at 89.96% against a threshold of 90 — it is in
 * the gate now, because #58 re-measured and the floor had moved, but the shape
 * of the problem it demonstrated has not gone away. A hard rule would demand
 * either a threshold cut or a second task's worth of tests smuggled into the
 * first, on whichever file hits that state next.
 *
 * So the gate ratchets instead. Every entry below is a file whose code runs
 * under test today and counts for nothing in the reported figures. The test
 * does not make this list unable to grow — it makes it unable to grow QUIETLY:
 * a new suite on an unlisted file fails coverage-gate.test.ts on the spot, and
 * the only way past is to add a line here, in a diff someone reviews. Entries
 * LEAVE by being listed in `collectCoverageFrom`; the same test fails on an
 * entry that is now gated, on one whose file is gone, and on one nothing
 * exercises any more, so an exemption cannot outlive its reason.
 *
 * The bar for a NEW entry: measure `pnpm --filter tenda-mobile test:cov` with
 * the file gated first. If the thresholds hold, gate it and do not come here.
 * Only a measured drop earns a new line, and the measurement goes in a comment
 * beside it.
 *
 * The SEED is not held to that bar and does not claim to be. It is the drift
 * as it stood when #58 measured it, less what has left since — 108 entries
 * against 83 gated subjects, so the headline figure still describes well under
 * half of what the suite executes.
 * Not one of them carries a measurement, because not one had been measured:
 * the only file that HAD been, stores/realtime.store.ts, was re-measured
 * during #58's audit, came out above the threshold, and went into the gate
 * instead of onto this list. Treat every line here as un-measured backlog
 * rather than as a finding that it cannot be gated. Adding to it is a decision
 * to be argued for in review; shrinking it needs no argument at all.
 */
export const UNGATED_WITH_TESTS: readonly string[] = [
  // Everything under api/ — the transport and the client wiring, which is all
  // that is left here since #42 moved the endpoint descriptions into
  // @tenda/shared. Both have their own suite; `collectCoverageFrom` has no
  // api/ pattern at all, so neither has ever counted.
  'api/client/index.ts',
  'api/request.ts',

  // Screens. An Expo Router screen is expensive to cover and cheap to leave
  // out, which is how the list grew this way to begin with — though it is the
  // components below, not these 18, that make up most of it.
  'app/(auth)/continue-with.tsx',
  'app/(auth)/get-started.tsx',
  'app/(auth)/profile-setup.tsx',
  'app/(auth)/verify-code.tsx',
  'app/(tabs)/create-gig.tsx',
  'app/(tabs)/exchange.tsx',
  'app/(tabs)/my-gigs.tsx',
  'app/(tabs)/profile.tsx',
  'app/(tabs)/settings.tsx',
  'app/(tabs)/wallet.tsx',
  'app/gig/[id]/applicants.tsx',
  'app/index.tsx',
  'app/my-gigs/drafts.tsx',
  'app/settings/security.tsx',
  'app/settings/token-approvals.tsx',
  'app/wallet/buy-sell.tsx',
  'app/wallet/intents/[id].tsx',
  'app/wc-return.tsx',

  // The largest block by far — 65 of the 109. Sixty-one have a suite named for
  // them; the other four — NetworkPicker and the three gig-form/steps — are
  // reached through GigComposerSteps.test.tsx, one directory up. None has ever
  // been measured against the gate. They are here because nobody listed them,
  // not because anyone found they measured badly.
  'components/auth/OtpCodeField.tsx',
  'components/chat/MessageBubble.tsx',
  'components/escrow/ChainBadge.tsx',
  'components/escrow/tx-action/TxConfirmDialog.tsx',
  'components/exchange/AssetChainPicker.tsx',
  'components/exchange/ExchangeMyOffersPage.tsx',
  'components/exchange/ExchangeOfferCard.tsx',
  'components/exchange/ExchangeTermsCard.tsx',
  'components/exchange/MyOfferRow.tsx',
  'components/exchange/PaymentInstructionsCard.tsx',
  'components/exchange/SellerPayoutCard.tsx',
  'components/form/DurationPicker.tsx',
  'components/form/SearchSheet.tsx',
  'components/form/file-picker/file-picker.operations.ts',
  'components/gig/DraftsBanner.tsx',
  'components/gig/GigForm.tsx',
  'components/gig/ProofRequirementsNote.tsx',
  'components/gig/category-icons.ts',
  'components/gig/feed/FeedHeader.tsx',
  'components/gig/gig-action-sheets/DeleteDraftDialog.tsx',
  'components/gig/gig-form/AcceptDeadlinePicker.tsx',
  'components/gig/gig-form/AddFundsNudge.tsx',
  'components/gig/gig-form/CrossBorderBanner.tsx',
  'components/gig/gig-form/NetworkPicker.tsx',
  'components/gig/gig-form/ProofRequirementPicker.tsx',
  'components/gig/gig-form/steps/GigDeliveryStep.tsx',
  'components/gig/gig-form/steps/GigDetailsStep.tsx',
  'components/gig/gig-form/steps/GigPaymentStep.tsx',
  'components/gig/gig-form/useGigForm.ts',
  'components/navigation/DrawerHeader.tsx',
  'components/notifications/NotificationRow.tsx',
  'components/onboarding/NudgeSheet.tsx',
  'components/payout/AddPayoutAccountForm.tsx',
  'components/payout/PayoutAccountForm.tsx',
  'components/payout/PayoutAccountList.tsx',
  'components/payout/PayoutAccountSelect.tsx',
  'components/profile/ProfileStats.tsx',
  'components/seeker/SeekerWelcomeSheet.tsx',
  'components/settings/AddSubscriptionSheet.tsx',
  'components/shared/DeadlineCountdown.tsx',
  'components/shared/FeeSummary.tsx',
  'components/shared/ProofsGrid.tsx',
  'components/ui/ChipGroup.tsx',
  'components/ui/ConfirmDialog.tsx',
  'components/ui/DurationChips.tsx',
  'components/ui/FilterSheet.tsx',
  'components/ui/Header.tsx',
  'components/ui/SegmentedTabs.tsx',
  'components/ui/information/ExpandableNotice.tsx',
  'components/ui/overlay/BottomSheet.tsx',
  'components/wallet/TxRow.tsx',
  'components/wallet/WalletEmptyState.tsx',
  'components/wallet/WalletLoadError.tsx',
  'components/wallet/sell/InstantSellTab.tsx',
  'components/wallet/sell/OfferDeadlines.tsx',
  'components/wallet/sell/OfferReviewCard.tsx',
  'components/wallet/sell/OfferSellTab.tsx',
  'components/wallet/sell/SellAssetAmount.tsx',
  'components/wallet/sell/SellPayoutSection.tsx',
  'components/wallet/sell/shared.tsx',
  'components/wallet/sell/useAssetSelection.ts',
  'components/wallet/sell/useInstantSell.ts',
  'components/wallet/sell/useOfferSell.ts',

  // Feature modules.
  'features/escrow-proofs/persistEscrowProofs.ts',

  // Hooks. useEscrowActions has six dedicated suites of its own — balance,
  // gate, guard-exit, phase, submit, takedown — and counts for nothing in the
  // reported figures. (A seventh, proof-hash, left when that function moved to
  // its own pure module, which IS gated.)
  'hooks/useAddPayoutAccount.ts',
  'hooks/useCountdown.ts',
  'hooks/useEscrowActions.ts',
  'hooks/useEscrowFee.ts',
  'hooks/useEscrowLiveRefresh.ts',
  'hooks/useExchangeAssetOptions.ts',
  'hooks/useGigFunding.ts',
  'hooks/useKeyboardHeight.ts',
  'hooks/useNotificationDeepLink.ts',
  'hooks/useNotificationsRealtime.ts',
  'hooks/usePayoutAccounts.ts',
  'hooks/useSpendableBalance.ts',

  // Library modules. lib/ws.ts is the WebSocket transport, covered by its own
  // suite — the realtime suites beside it mock it rather than drive it, which
  // is why gating it would rest on that one suite alone.
  'lib/apple-signin.ts',
  'lib/google-signin.ts',
  'lib/notificationRoute.ts',
  'lib/post-auth-nav.ts',
  'lib/subscriptionCities.ts',
  'lib/ws.ts',

  // Zustand stores.
  'stores/chain-registry.store.ts',
  'stores/escrow.store.ts',
  'stores/pending-sync.store.ts',
  'stores/wallet-sync.ts',
]
