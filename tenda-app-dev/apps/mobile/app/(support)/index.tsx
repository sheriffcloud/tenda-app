import { SUPPORT_TOPICS, type SupportTopic } from '@tenda/shared'
import { useState } from 'react'
import { View, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  Wallet,
  PlusCircle,
  Hammer,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  Search,
  X,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { ScreenContainer, Header, Text } from '@/components/ui'
import { TopicCard } from '@/components/support'

interface Topic {
  Icon: LucideIcon
  title: string
  description: string
  route: string
}

const TOPIC_VISUALS: Record<SupportTopic['slug'], { Icon: Topic['Icon']; route: string }> = {
  escrow:   { Icon: ShieldCheck, route: '/(support)/escrow' },
  posting:  { Icon: PlusCircle,  route: '/(support)/posting' },
  working:  { Icon: Hammer,      route: '/(support)/working' },
  wallet:   { Icon: Wallet,      route: '/(support)/wallet' },
  glossary: { Icon: BookOpen,    route: '/(support)/glossary' },
  faq:      { Icon: HelpCircle,  route: '/(support)/faq' },
}

const TOPICS: Topic[] = SUPPORT_TOPICS.map((t) => ({
  title: t.title,
  description: t.description,
  ...TOPIC_VISUALS[t.slug],
}))

export default function SupportIndexScreen() {
  const { theme } = useUnistyles()
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? TOPICS.filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.description.toLowerCase().includes(query.toLowerCase()),
      )
    : TOPICS

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Help & Guide" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Search wrap */}
        <View
          style={[
            s.search,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <Search size={16} color={theme.colors.content.tertiary} />
          <SearchField value={query} onChangeText={setQuery} />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={14} color={theme.colors.content.tertiary} />
            </Pressable>
          )}
        </View>

        {/* Topic list */}
        <View style={s.list}>
          {filtered.map((topic, i) => (
            <TopicCard
              key={topic.route}
              Icon={topic.Icon}
              title={topic.title}
              description={topic.description}
              route={topic.route}
              showDivider={i < filtered.length - 1}
            />
          ))}

          {filtered.length === 0 && (
            <View style={s.empty}>
              <Text style={[s.emptyText, { color: theme.colors.content.tertiary }]}>
                No topics match &quot;{query}&quot;
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

function SearchField({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const { theme } = useUnistyles()
  // Inline TextInput to keep the wrap-row's bordered-input feel.
  // Using react-native TextInput directly (not the Input primitive) so the
  // search field can sit inside the wrap row without nested borders.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextInput } = require('react-native') as typeof import('react-native')
  return (
    <TextInput
      placeholder="Search topics…"
      placeholderTextColor={theme.colors.content.tertiary}
      value={value}
      onChangeText={onChangeText}
      style={[s.input, { color: theme.colors.content.primary }]}
      autoCorrect={false}
      autoCapitalize="none"
    />
  )
}

const s = StyleSheet.create({
  scroll: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  search: {
    marginHorizontal: 20,
    marginTop: 8,
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  input: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.07,
    padding: 0,
  },
  list: {
    marginTop: 14,
  },
  empty: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
})
