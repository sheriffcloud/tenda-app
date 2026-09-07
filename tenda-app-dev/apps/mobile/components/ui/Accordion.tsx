import { useRef, useState, type ReactNode } from 'react'
import { View, Pressable, Animated, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronDown } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text } from './Text'
import { Divider } from './Divider'

interface AccordionItemProps {
  title: string
  children: ReactNode
  icon?: ReactNode
  defaultExpanded?: boolean
  last?: boolean
}

export function AccordionItem({
  title,
  children,
  icon,
  defaultExpanded = false,
  last = false,
}: AccordionItemProps) {
  const { theme } = useUnistyles()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const rotateValue = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current

  function toggle() {
    const toValue = expanded ? 0 : 1
    Animated.timing(rotateValue, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start()
    setExpanded((prev) => !prev)
  }

  const rotate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  })

  return (
    <View>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          s.header,
          pressed && { backgroundColor: theme.colors.surface.pressed },
        ]}
      >
        {icon && <View style={s.icon}>{icon}</View>}
        <Text variant="body" weight="medium" style={s.title}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={18} color={theme.colors.content.secondary} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <View style={[s.content, { borderTopColor: theme.colors.border.subtle }]}>
          {children}
        </View>
      )}

      {!last && <Divider spacing={0} />}
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  icon: {
    width: 20,
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
