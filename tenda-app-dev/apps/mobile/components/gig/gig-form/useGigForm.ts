import { useEffect, useMemo, useState } from 'react'
import {
  ASSET_META,
  CATEGORY_HINTS,
  DEFAULT_COMPLETION_SECONDS,
  PROOF_NOTE,
  composerProofSubmission,
  composerWalletGate,
  defaultGigChainId,
  draftFromProofParams,
  getGigMissingRequirement,
  getGigStepMissingRequirement,
  gigAssetByChain,
  gigChainOptions,
  solanaChainId,
  type ChainRegistryEntry,
  type GigCategory,
  type GigChainOption,
  type GigComposerStep,
  type GigFormValues,
  type ProofParamsDraft,
  type ProofType,
} from '@tenda/shared'
import { getDeviceCountry } from '@/lib/device'
import { api } from '@/api/client'
import { SOLANA_NETWORK } from '@/wallet/config'
import { useAuthStore } from '@/stores/auth.store'
import { useModerationPreview } from '@/hooks/useModerationPreview'

/**
 * One selectable settlement chain. The shape and the rule that fills it are
 * SHARED (#58) — this file and web's useGigForm each had their own copy and
 * both shipped the same defect.
 */
export type ChainOption = GigChainOption

/**
 * Controller for the gig create/edit form, owns all field state, the
 * server chain registry, the live moderation preview, and submit/validation.
 * The screen stays presentational and just wires the returned values to the UI.
 */
export function useGigForm(
  initialValues: Partial<GigFormValues> | undefined,
  onSubmit: (values: GigFormValues) => Promise<void>,
) {
  const homeCountry = useAuthStore((s) => s.user?.country ?? null)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const refreshMe = useAuthStore((s) => s.refreshMe)

  // Chain eligibility reads wallets[], so the composer must not be the one
  // surface that never asks for them: unloaded reads as "link a wallet" to a
  // user who already did. Same guarded call as useSigningWallet and
  // ApplySheet — `refreshMe` is not deduped, so the status check is what
  // keeps opening the composer from refetching the account every time.
  useEffect(() => {
    if (useAuthStore.getState().walletsStatus !== 'ready') void refreshMe()
  }, [refreshMe])

  const defaultChainId = solanaChainId(SOLANA_NETWORK)
  const requestedChainId = initialValues?.chainId
  const initialChainId = requestedChainId !== undefined && gigAssetByChain(requestedChainId) !== null
    ? requestedChainId
    : defaultChainId
  const [title, setTitle]                         = useState(initialValues?.title ?? '')
  const [description, setDescription]             = useState(initialValues?.description ?? '')
  // The chain the PERSON chose, or null while they have not. NOT the current
  // selection: the registry and the wallet list both land after first paint,
  // so the selection is DERIVED below rather than seeded at mount and synced.
  // A repost's stored chain counts as chosen only if it survived validation —
  // a chain since dropped from the manifest is not a choice anyone made.
  const [pickedChainId, setPickedChainId] = useState<string | null>(
    initialChainId === requestedChainId ? initialChainId : null,
  )
  const [paymentRaw, setPaymentRaw]               = useState(initialValues?.paymentRaw ?? '')
  const [registry, setRegistry]                   = useState<ChainRegistryEntry[]>([])
  const [completionDuration, setCompletionDuration] = useState(
    initialValues?.completionDuration ?? DEFAULT_COMPLETION_SECONDS,
  )
  const [selectedCategory, setSelectedCategory]   = useState<GigCategory | null>(initialValues?.category ?? null)
  // Prefer the user's account country; fall back to the device locale region
  // (often the phone's language, not where the user actually is) only when the
  // account has none.
  const [selectedCountry, setSelectedCountry]     = useState<string | null>(initialValues?.country ?? homeCountry ?? getDeviceCountry())
  const [isRemote, setIsRemote]                   = useState(initialValues?.remote ?? false)
  const [selectedCity, setSelectedCity]           = useState<string | null>(initialValues?.city ?? null)
  const [acceptDeadlineHours, setAcceptDeadlineHours] = useState<number>(initialValues?.acceptDeadlineHours ?? 168)
  const [proofRequirements, setProofRequirements]  = useState<ProofType[]>(initialValues?.proofRequirements ?? [])
  // The param editors' state (pin/radius/fields), rebuilt from a draft's
  // stored params + pin on repost. Kept whole even for deselected types —
  // composerProofSubmission scopes what actually leaves the form.
  const [proofDraft, setProofDraft] = useState<ProofParamsDraft>(() =>
    draftFromProofParams(
      initialValues?.proofParams ?? null,
      initialValues?.latitude ?? null,
      initialValues?.longitude ?? null,
    ),
  )
  // Instant by default: it is how every gig behaved before the mode existed,
  // and it is the cheaper of the two for the poster.
  const [requiresApproval, setRequiresApproval]    = useState(initialValues?.requiresApproval ?? false)
  const [warnSheetOpen, setWarnSheetOpen] = useState(false)

  // CO5: chain options come from the server registry; a chain is gig-
  // eligible when the shared gigAssetByChain policy names an asset the
  // registry actually carries. Whether the user can SIGN on it is a
  // separate question, owned by gigChainOptions: since #58 a chain of ANY
  // namespace stays disabled until a verified wallet is linked on that
  // same namespace.
  useEffect(() => {
    api.platform
      .chains()
      .then(({ data }) => setRegistry(data))
      .catch(() => setRegistry([])) // silent: the Solana default still works
  }, [])

  const chainOptions: ChainOption[] = useMemo(
    () => gigChainOptions({ registry, wallets, walletsStatus }),
    [registry, wallets, walletsStatus],
  )

  // Until the person picks, follow the wallets. Leaving an untouched composer
  // on a constant is the #58 wall one step later: a user who linked only one
  // namespace was pointed at another and only found out at signing.
  const chainId = pickedChainId ?? defaultGigChainId(chainOptions, defaultChainId)

  // #59: whether this composer can be FINISHED, read off the same options the
  // picker renders. The server has always known; it just said so at the
  // signature, after the form was filled.
  const walletGate = composerWalletGate(chainOptions)

  // The asset is POLICY-derived, never user-picked: gigs are USDC-only.
  const asset = gigAssetByChain(chainId) ?? gigAssetByChain(defaultChainId) ?? 'USDC_SOL'
  const assetSymbol = ASSET_META[asset]?.symbol ?? asset

  // Stage-6 live moderation hints, debounced, advisory only; the server
  // re-runs the same pipeline on create and stays authoritative.
  const moderation = useModerationPreview({
    title,
    description,
    category: selectedCategory,
    country: selectedCountry,
    asset,
    paymentRaw,
  })

  const validationValues = {
    title,
    description,
    category: selectedCategory,
    remote: isRemote,
    country: selectedCountry,
    city: selectedCity,
    asset,
    paymentRaw,
    completionDuration,
    proofRequirements,
    proofDraft,
  }
  const missingRequirement = getGigMissingRequirement(validationValues)

  const isValid = missingRequirement === null

  async function submitValues() {
    await onSubmit({
      title,
      description,
      chainId,
      asset,
      paymentRaw,
      completionDuration,
      category: selectedCategory,
      // Remote gigs carry no location; physical gigs send the work country + city.
      country: isRemote ? null : selectedCountry,
      remote: isRemote,
      city: isRemote ? null : selectedCity,
      acceptDeadlineHours,
      proofRequirements,
      requiresApproval,
      // Pin + params derived in one shared step, scoped to the selected types.
      ...composerProofSubmission(proofRequirements, proofDraft),
    })
  }

  async function handleSubmit() {
    if (!isValid) return
    // Warn verdicts get one explicit confirmation before publishing.
    if (moderation?.decision === 'warn' && !warnSheetOpen) {
      setWarnSheetOpen(true)
      return
    }
    setWarnSheetOpen(false)
    await submitValues()
  }

  const descriptionHint = `${
    selectedCategory ? CATEGORY_HINTS[selectedCategory] : 'Include scope, requirements, and expectations.'
  } ${PROOF_NOTE}`

  return {
    title, setTitle,
    description, setDescription,
    chainId,
    selectChain: setPickedChainId,
    paymentRaw, setPaymentRaw,
    completionDuration, setCompletionDuration,
    selectedCategory, setSelectedCategory,
    selectedCountry, setSelectedCountry,
    isRemote, setIsRemote,
    selectedCity, setSelectedCity,
    acceptDeadlineHours, setAcceptDeadlineHours,
    proofRequirements, setProofRequirements,
    proofDraft, setProofDraft,
    requiresApproval, setRequiresApproval,
    warnSheetOpen, setWarnSheetOpen,
    homeCountry,
    chainOptions,
    walletGate,
    /** Re-run the wallets[] load after it failed (#59 notice's retry). */
    retryWallets: refreshMe,
    asset,
    assetSymbol,
    moderation,
    isValid,
    missingRequirement,
    getStepMissingRequirement: (step: GigComposerStep) => (
      getGigStepMissingRequirement(step, validationValues)
    ),
    descriptionHint,
    handleSubmit,
    submitValues,
  }
}
