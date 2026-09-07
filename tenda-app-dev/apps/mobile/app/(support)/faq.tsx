import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { MessageCircle, Mail, Globe, Hash, Camera } from 'lucide-react-native'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { InfoCard, ContactRow } from '@/components/support'
import { APP_INFO, SUPPORT_FAQS } from '@tenda/shared'


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
          {SUPPORT_FAQS.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              title={faq.question}
              defaultExpanded={index === 0}
              last={index === SUPPORT_FAQS.length - 1}
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
