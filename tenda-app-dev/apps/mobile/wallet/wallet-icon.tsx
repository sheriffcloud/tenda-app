import { Image, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Wallet } from 'lucide-react-native'
import type { WalletAdapter } from './adapters/types'

interface WalletIconProps {
  adapter: WalletAdapter
  size?: number
}

export function WalletIcon({ adapter, size = 36 }: WalletIconProps) {
  const { theme } = useUnistyles()

  // Aggregator adapters (WalletConnect) have no single bundled icon, show a
  // generic wallet glyph on a brand-tinted circle instead.
  if (adapter.iconSource === undefined) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.brand.primarySurface,
          },
        ]}
      >
        <Wallet size={size * 0.55} color={theme.colors.brand.primary} />
      </View>
    )
  }

  return (
    <Image
      source={adapter.iconSource}
      accessibilityIgnoresInvertColors
      style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    resizeMode: 'contain',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
