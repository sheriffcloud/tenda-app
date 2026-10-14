import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { SUPPORT_GLOSSARY } from '@tenda/shared'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'

export default function GlossaryScreen() {
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Glossary" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={[s.intro, { color: theme.colors.content.secondary }]}>
          Plain-English definitions of the crypto and Tenda terms you&apos;ll see across the app.
        </Text>

        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          {SUPPORT_GLOSSARY.map((item, index) => (
            <AccordionItem
              key={item.term}
              title={item.term}
              last={index === SUPPORT_GLOSSARY.length - 1}
            >
              <Text style={[s.body, { color: theme.colors.content.secondary }]}>
                {item.definition}
              </Text>
            </AccordionItem>
          ))}
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
  intro: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  card: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingBottom: 16,
  },
})
