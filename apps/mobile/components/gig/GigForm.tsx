import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import { formatAssetAmount, formatDuration } from '@tenda/shared'
import { PriceWarningSheet } from '@/components/moderation/PriceWarningSheet'
import { ComposerWalletNotice } from './gig-form/ComposerWalletNotice'
import { ModerationHint } from './gig-form/ModerationHint'
import { GigComposerNavigation } from './gig-form/GigComposerNavigation'
import { GigComposerProgress } from './gig-form/GigComposerProgress'
import { GIG_COMPOSER_STEPS, type GigComposerStep, type GigFormValues } from '@tenda/shared'
import { GigDeliveryStep } from './gig-form/steps/GigDeliveryStep'
import { GigDetailsStep } from './gig-form/steps/GigDetailsStep'
import { GigPaymentStep } from './gig-form/steps/GigPaymentStep'
import { useGigForm } from './gig-form/useGigForm'

interface GigFormProps {
  initialValues?: Partial<GigFormValues>
  onSubmit: (values: GigFormValues) => Promise<void>
  submitLabel: string
  isLoading: boolean
}

export function GigForm({ initialValues, onSubmit, submitLabel, isLoading }: GigFormProps) {
  const form = useGigForm(initialValues, onSubmit)
  const [stepIndex, setStepIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const step = GIG_COMPOSER_STEPS[stepIndex].key
  const finalStep = stepIndex === GIG_COMPOSER_STEPS.length - 1
  const missingRequirement = finalStep
    ? form.missingRequirement
    : form.getStepMissingRequirement(step)

  function moveToStep(nextIndex: number) {
    setStepIndex(nextIndex)
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  function handleContinue() {
    if (missingRequirement !== null) return
    if (finalStep) {
      void form.handleSubmit()
      return
    }
    moveToStep(stepIndex + 1)
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GigComposerProgress
        step={step}
        onStepPress={(index) => { if (!isLoading) moveToStep(index) }}
      />
      <ScrollView
        ref={scrollRef}
        style={s.flex}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Above the step, so it is read on step ONE rather than discovered at
            the signature — the whole point of #59. */}
        <ComposerWalletNotice gate={form.walletGate} onRetry={() => void form.retryWallets()} />
        <GigStep step={step} form={form} />
      </ScrollView>

      {/* On every step: the verdict needs a budget, which only exists from
          the payment step onward — gating this to one step would hide it. */}
      <ModerationHint moderation={form.moderation} />
      <GigComposerNavigation
        firstStep={stepIndex === 0}
        finalStep={finalStep}
        missingRequirement={missingRequirement}
        submitLabel={submitLabel}
        loading={isLoading}
        onBack={() => moveToStep(stepIndex - 1)}
        onContinue={handleContinue}
      />

      <PriceWarningSheet
        visible={form.warnSheetOpen}
        reasons={form.moderation?.reasons ?? []}
        onPublishAnyway={() => {
          form.setWarnSheetOpen(false)
          void form.submitValues()
        }}
        onEdit={() => form.setWarnSheetOpen(false)}
      />
    </KeyboardAvoidingView>
  )
}

type GigFormController = ReturnType<typeof useGigForm>

function GigStep({ step, form }: { step: GigComposerStep; form: GigFormController }) {
  if (step === 'details') {
    return (
      <GigDetailsStep
        category={form.selectedCategory}
        onCategoryChange={form.setSelectedCategory}
        title={form.title}
        onTitleChange={form.setTitle}
        description={form.description}
        onDescriptionChange={form.setDescription}
        descriptionHint={form.descriptionHint}
        remote={form.isRemote}
        onRemoteChange={form.setIsRemote}
        country={form.selectedCountry}
        city={form.selectedCity}
        onLocationChange={(country, city) => {
          form.setSelectedCountry(country)
          form.setSelectedCity(city)
        }}
        homeCountry={form.homeCountry}
        assetSymbol={form.assetSymbol}
      />
    )
  }

  if (step === 'payment') {
    return (
      <GigPaymentStep
        chainOptions={form.chainOptions}
        chainId={form.chainId}
        onChainChange={form.selectChain}
        asset={form.asset}
        assetSymbol={form.assetSymbol}
        paymentRaw={form.paymentRaw}
        onPaymentChange={form.setPaymentRaw}
        completionDuration={form.completionDuration}
        onCompletionChange={form.setCompletionDuration}
        acceptDeadlineHours={form.acceptDeadlineHours}
        onAcceptDeadlineChange={form.setAcceptDeadlineHours}
      />
    )
  }

  const location = form.isRemote
    ? 'Remote'
    : [form.selectedCity, form.selectedCountry].filter(Boolean).join(', ')
  return (
    <GigDeliveryStep
      requiresApproval={form.requiresApproval}
      onApprovalChange={form.setRequiresApproval}
      proofRequirements={form.proofRequirements}
      onProofRequirementsChange={form.setProofRequirements}
      remote={form.isRemote}
      proofDraft={form.proofDraft}
      onProofDraftChange={form.setProofDraft}
      title={form.title}
      location={location}
      budget={formatAssetAmount(form.paymentRaw, form.asset)}
      timing={`${formatDuration(form.completionDuration)} to complete`}
    />
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 28 },
})
