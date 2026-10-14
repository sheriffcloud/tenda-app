import { StyleProp, ImageStyle } from 'react-native'
import { Image } from 'expo-image'
import { useIsDark } from '@/lib/theme'

const LOGO_LIGHT = require('@/assets/images/logo_dark.png')
const LOGO_DARK = require('@/assets/images/logo.png')

interface BrandLogoProps {
  size?: number
  style?: StyleProp<ImageStyle>
}

/** Theme-aware Tenda badge: navy logo on light backgrounds, white variant in dark mode. */
export function BrandLogo({ size = 64, style }: BrandLogoProps) {
  const isDark = useIsDark()
  return (
    <Image
      source={isDark ? LOGO_DARK : LOGO_LIGHT}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
    />
  )
}
