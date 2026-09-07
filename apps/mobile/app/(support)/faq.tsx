import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { MessageCircle, Mail, Globe, Hash, Camera } from 'lucide-react-native'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { InfoCard, ContactRow } from '@/components/support'
import { APP_INFO } from '@/lib/app-info'

const FAQS = [
  {
    question: 'Do I need crypto to use Tenda?',
    answer:
      "No, you can receive payouts directly to your bank. The wallet holds what you've earned; you cash out in your local currency through Trade.",
  },
  {
    question: 'Will my money be safe?',
    answer:
      "Yes. Payment is locked in a smart contract on the Solana blockchain, not held by Tenda. We can't touch your money. It's released only when you (the poster) approve the work, or returned to you if the gig expires or a dispute is resolved in your favour.",
  },
  {
    question: 'What if the client never approves?',
    answer:
      "If a poster doesn't approve or raise a dispute within the gig's time limit, the gig expires and you can raise a dispute through the app. For ongoing issues, contact our support team.",
  },
  {
    question: 'Can I lose my money as a poster?',
    answer:
      "Only if you approve work you're not satisfied with. If the work isn't done correctly, raise a dispute before approving. Never tap Approve unless you're satisfied; it cannot be undone.",
  },
  {
    question: 'How do I withdraw to my bank account?',
    answer:
      'SOL in your wallet can be exchanged for Naira through Tenda P2P or Nigerian crypto exchanges. You send SOL and receive Naira in your bank account from the buyer.',
  },
  {
    question: 'What is SOL?',
    answer:
      "SOL is the digital currency of the Solana blockchain, the network Tenda runs on. Think of it like airtime units, but for a financial network. Tenda shows SOL amounts alongside their local equivalent so you always know what you're paying or earning.",
  },
  {
    question: 'Can I both post gigs and work on gigs?',
    answer:
      'Yes, there are no restrictions. You can post a gig as a client and also apply to work on other gigs as a worker. Use both sides of the marketplace.',
  },
] as const

export default function FaqScreen() {
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="FAQ & Support" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        {/* FAQ accordion grouped in a single card */}
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          {FAQS.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              title={faq.question}
              defaultExpanded={index === 0}
              last={index === FAQS.length - 1}
            >
              <Text style={[s.answer, { color: theme.colors.content.secondary }]}>
                {faq.answer}
              </Text>
            </AccordionItem>
          ))}
        </View>

        {/* Contact us */}
        <SectionLabel>Contact us</SectionLabel>
        <View
          style={[
            s.contactGroup,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <ContactRow
            Icon={MessageCircle}
            label="WhatsApp"
            value="Chat with us"
            url={APP_INFO.support.whatsapp}
            tone="success"
          />
          <ContactRow
            Icon={Mail}
            label="Email"
            value={APP_INFO.support.email}
            url={`mailto:${APP_INFO.support.email}`}
          />
          <ContactRow
            Icon={Globe}
            label="Website"
            value={APP_INFO.external.website}
            url={APP_INFO.external.website}
          />
          <ContactRow
            Icon={Hash}
            label="Twitter / X"
            value="@tendahq"
            url={APP_INFO.social.twitter}
            tone="accent"
          />
          <ContactRow
            Icon={Camera}
            label="Instagram"
            value="@tendahq"
            url={APP_INFO.social.instagram}
            tone="accent"
            showDivider={false}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

// Suppress unused warning for InfoCard import, kept as the canonical wrapper
// when extending FAQ with intro/explainer blocks.
void InfoCard

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
  answer: {
    fontSize: 13.5,
    lineHeight: 21,
    paddingBottom: 16,
  },
  contactGroup: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
})
