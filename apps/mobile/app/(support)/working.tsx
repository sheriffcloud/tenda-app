import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Header, AccordionItem } from '@/components/ui'
import { GuideStep } from '@/components/support'

export default function WorkingGuideScreen() {
  const { theme } = useUnistyles()
  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Working on a Gig" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <AccordionItem title="How to find gigs" defaultExpanded>
            <GuideStep step={1} title="Open the Home tab" description="The feed shows open gigs near you." />
            <GuideStep step={2} title="Use filters" description="Narrow by category, city, or keyword to find gigs that match your skills." />
            <GuideStep step={3} title="Tap a gig to see details" description="Review title, description, payment, duration, and the poster's profile before accepting." />
          </AccordionItem>

          <AccordionItem title="How to accept a gig">
            <GuideStep step={1} title="Open the gig and tap Accept" description="Only open gigs with no worker yet can be accepted." />
            <GuideStep
              step={2}
              title="Approve the transaction"
              description="Your wallet opens and asks you to sign, this records your acceptance on-chain."
              tip="Payment is already in escrow. You're not paying anything to accept."
            />
            <GuideStep step={3} title="Get to work" description="Start as agreed. Message the poster from the gig screen if you have questions." />
          </AccordionItem>

          <AccordionItem title="How to submit proof of work">
            <GuideStep step={1} title="Complete the work first" description="Make sure everything matches the gig description before submitting." />
            <GuideStep step={2} title="Tap Submit Proof" description="Upload photos, a link, or a short description of what you delivered." />
            <GuideStep step={3} title="Sign the submission" description="Your wallet asks you to approve, this records the submission on-chain." />
            <GuideStep step={4} title="Wait for the client" description="The poster reviews and approves, or raises a dispute." />
          </AccordionItem>

          <AccordionItem title="How and when you get paid" last>
            <GuideStep step={1} title="The client taps Approve" description="Once approved, the on-chain transaction is signed immediately." />
            <GuideStep
              step={2}
              title="Payment arrives in your wallet"
              description="SOL lands directly in your wallet address. No waiting, no withdrawal."
              tip="You can convert SOL to your local currency through Tenda P2P."
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
