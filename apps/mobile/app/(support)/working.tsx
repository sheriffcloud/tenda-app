import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { SUPPORT_GUIDE_WORKING } from '@tenda/shared'
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
          {SUPPORT_GUIDE_WORKING.map((section, sectionIndex) => (
            <AccordionItem
              key={section.title}
              title={section.title}
              defaultExpanded={sectionIndex === 0}
              last={sectionIndex === SUPPORT_GUIDE_WORKING.length - 1}
            >
              {section.steps.map((step, i) => (
                <GuideStep
                  key={step.title}
                  step={i + 1}
                  title={step.title}
                  description={step.description}
                  warning={step.warning}
                  tip={step.tip}
                />
              ))}
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
  card: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
})
