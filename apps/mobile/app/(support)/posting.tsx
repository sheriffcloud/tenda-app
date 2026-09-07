import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Header, AccordionItem } from '@/components/ui'
import { GuideStep } from '@/components/support'

export default function PostingGuideScreen() {
  const { theme } = useUnistyles()
  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Posting a Gig" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <AccordionItem title="How to create a gig" defaultExpanded>
            <GuideStep step={1} title="Tap + Post a Gig" description="From the center tab or the Drawer." />
            <GuideStep step={2} title="Describe the job" description="Be specific, workers decide to accept based on what you write." />
            <GuideStep step={3} title="Set the payment in SOL" description="The equivalent in your local currency is shown for reference." />
            <GuideStep step={4} title="Review your draft" description="Your gig saves as a draft first, check title, description, location, and payment before publishing." />
            <GuideStep
              step={5}
              title="Publish + fund the escrow"
              description="Tap Publish to lock payment on-chain. You'll approve the transaction in your wallet."
              warning="Your wallet needs the gig amount + a small Solana network fee (~$0.01)."
            />
            <GuideStep step={6} title="Wait for a worker to accept" description="Your gig is now live. Workers in your area will see it in the feed." />
          </AccordionItem>

          <AccordionItem title="Tips for setting a fair price">
            <GuideStep step={1} title="Research similar gigs" description="Browse the feed to see what others charge for similar work." />
            <GuideStep step={2} title="Account for time and skill" description="A 2-hour errand should pay more than a 30-minute task. Skilled work commands higher rates." />
            <GuideStep step={3} title="Be specific in your description" description="Clear gigs attract better workers and reduce disputes later." />
          </AccordionItem>

          <AccordionItem title="Approving completed work">
            <GuideStep step={1} title="You'll get a notification on submission" description="Open the gig to review the submitted proof." />
            <GuideStep step={2} title="Review carefully" description="Make sure the work matches what was agreed in the description." />
            <GuideStep step={3} title="Tap Approve" description="Your wallet signs the release transaction. Payment goes to the worker instantly." />
          </AccordionItem>

          <AccordionItem title="How to raise a dispute" last>
            <GuideStep step={1} title="Tap Dispute on the gig screen" description="Available after the worker submits proof." />
            <GuideStep step={2} title="Describe the issue" description="Explain what was missing or done incorrectly." />
            <GuideStep
              step={3}
              title="Wait for resolution"
              description="Tenda reviews both sides and decides. Payment stays in escrow until then."
              tip="A specific, detailed gig description makes disputes easier to resolve in your favour."
            />
          </AccordionItem>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  scroll: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  card: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
})
