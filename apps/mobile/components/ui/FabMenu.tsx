import { useEffect, useRef } from 'react'
import {
  Animated, Modal, Pressable, StyleSheet, View,
} from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { Text } from './Text'

export interface FabAction {
  icon:    React.ReactNode
  label:   string
  onPress: () => void
}

interface FabMenuProps {
  visible:     boolean
  onClose:     () => void
  actions:     FabAction[]
  bottomInset: number   // tab bar height, cards float just above it
}

const STAGGER_MS = 50

export function FabMenu({ visible, onClose, actions, bottomInset }: FabMenuProps) {
  const { theme } = useUnistyles()

  const backdrop = useRef(new Animated.Value(0)).current
  const cards    = useRef(actions.map(() => ({
    scale:      new Animated.Value(0),
    translateY: new Animated.Value(12),
  }))).current

  useEffect(() => {
    if (visible) {
      Animated.timing(backdrop, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }).start()

      // Stagger cards in, bottom card first
      const animations = [...cards].reverse().map((c, i) =>
        Animated.sequence([
          Animated.delay(i * STAGGER_MS),
          Animated.parallel([
            Animated.spring(c.scale,      { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 200 }),
            Animated.spring(c.translateY, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 200 }),
          ]),
        ]),
      )
      Animated.parallel(animations).start()
    } else {
      Animated.timing(backdrop, {
        toValue: 0, duration: 150, useNativeDriver: true,
      }).start()
      cards.forEach((c) => {
        c.scale.setValue(0)
        c.translateY.setValue(12)
      })
    }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,22,30,0.28)', opacity: backdrop }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Action cards */}
      <View
        style={[s.container, { bottom: bottomInset + 16 }]}
        pointerEvents="box-none"
      >
        {actions.map((action, i) => (
          <Animated.View
            key={action.label}
            style={{
              transform: [
                { scale:      cards[i]!.scale },
                { translateY: cards[i]!.translateY },
              ],
              opacity: cards[i]!.scale,
            }}
          >
            <Pressable
              style={[
                s.card,
                {
                  backgroundColor: theme.colors.surface.card,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.12,
                  shadowRadius: 24,
                  elevation: 6,
                },
              ]}
              onPress={() => { onClose(); action.onPress() }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[s.iconWrap, { backgroundColor: theme.colors.brand.primarySurface }]}>
                {action.icon}
              </View>
              <Text size={14.5} weight="semibold" color={theme.colors.content.primary} style={s.label}>
                {action.label}
              </Text>
              <ChevronRight size={13} color={theme.colors.content.tertiary} />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: {
    position:   'absolute',
    left:       0,
    right:      0,
    alignItems: 'center',
    gap:        10,
  },
  card: {
    width:          240,
    height:         56,
    paddingLeft:    12,
    paddingRight:   14,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    borderRadius:   14,
  },
  iconWrap: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    letterSpacing: -0.075,
  },
})
