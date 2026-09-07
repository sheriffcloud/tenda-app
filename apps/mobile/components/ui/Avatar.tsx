import { View } from 'react-native'
import { Image } from 'expo-image'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'

type Size = 'sm' | 'md' | 'lg' | 'xl'
type Tone = 'default' | 'brand' | 'accent' | 'ok'
/** Exported: it doubles as a theme-colour key (`theme.colors[g].primary`). */
export type AvatarGradient = 'accent' | 'brand'

interface AvatarProps {
  src?: string | null
  name?: string
  size?: Size
  tone?: Tone
  gradient?: AvatarGradient
  ring?: 'seeker'
  unreadDot?: boolean
}

const SIZES: Record<Size, number> = { sm: 32, md: 44, lg: 48, xl: 96 }
const FONTS: Record<Size, number> = { sm: 12, md: 14, lg: 17, xl: 32 }

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function Avatar({
  src,
  name,
  size = 'md',
  tone = 'default',
  gradient,
  ring,
  unreadDot,
}: AvatarProps) {
  const { theme } = useUnistyles()
  const dim = SIZES[size]
  const r = dim / 2
  const fontSize = FONTS[size]
  const isLarge = size === 'lg' || size === 'xl'

  let backgroundColor: string
  let initialColor: string

  if (isLarge) {
    const grad: AvatarGradient = gradient ?? 'accent'
    backgroundColor = grad === 'brand' ? theme.colors.brand.primary : theme.colors.accent.primary
    initialColor = '#FFFFFF'
  } else {
    if (tone === 'brand') {
      backgroundColor = theme.colors.brand.primarySurface
      initialColor = theme.colors.brand.primary
    } else if (tone === 'accent') {
      backgroundColor = theme.colors.accent.primarySurface
      initialColor = theme.colors.accent.primary
    } else if (tone === 'ok') {
      backgroundColor = theme.colors.feedback.success.surface
      initialColor = theme.colors.feedback.success.base
    } else {
      backgroundColor = theme.colors.surface.inset
      initialColor = theme.colors.content.secondary
    }
  }

  const inner = src ? (
    <Image
      source={{ uri: src }}
      style={{ width: dim, height: dim, borderRadius: r, backgroundColor: theme.colors.surface.inset }}
    />
  ) : (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: r,
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        size={fontSize}
        weight="bold"
        color={initialColor}
        style={size === 'xl' ? { letterSpacing: -0.64 } : undefined}
      >
        {name ? getInitials(name) : '?'}
      </Text>
    </View>
  )

  // Seeker ring (xl only): 3px --card inner ring + 2px --accent outer ring.
  // Implement as nested padded views to simulate CSS box-shadow rings.
  let avatarNode = inner
  if (ring === 'seeker' && size === 'xl') {
    avatarNode = (
      <View
        style={{
          padding: 2,
          borderRadius: r + 5,
          backgroundColor: theme.colors.accent.primary,
        }}
      >
        <View
          style={{
            padding: 3,
            borderRadius: r + 3,
            backgroundColor: theme.colors.surface.card,
          }}
        >
          {inner}
        </View>
      </View>
    )
  }

  if (unreadDot && size === 'md') {
    return (
      <View style={{ position: 'relative' }}>
        {avatarNode}
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: theme.colors.surface.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.colors.brand.primary,
            }}
          />
        </View>
      </View>
    )
  }

  return avatarNode
}
