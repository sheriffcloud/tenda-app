import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { CircleCheck } from 'lucide-react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'
import { adapters } from './adapters/registry'
import type { WalletAdapter } from './adapters/types'
import type { Namespace } from './types'
import { WalletIcon } from './wallet-icon'

interface WalletPickerProps {
  visible: boolean
  onClose: () => void
  onSelect: (adapter: WalletAdapter) => void
}

interface PickerEntry {
  adapter: WalletAdapter
  installed: boolean
}

function formatNamespaces(ns: readonly Namespace[]): string {
  return ns.map((n) => (n === 'eip155' ? 'EVM' : 'Solana')).join(' + ')
}

export function WalletPicker({ visible, onClose, onSelect }: WalletPickerProps) {
  const { theme } = useUnistyles()
  const [entries, setEntries] = useState<PickerEntry[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      adapters.map(async (a) => {
        const [available, installed] = await Promise.all([a.isAvailable(), a.isInstalled()])
        return available ? { adapter: a, installed } : null
      }),
    ).then((results) => {
      if (cancelled) return
      const filtered = results.filter((e): e is PickerEntry => e !== null)
      // Installed wallets bubble to the top so the most-likely choice is first.
      filtered.sort((a, b) => Number(b.installed) - Number(a.installed))
      setEntries(filtered)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Connect a wallet">
      <View style={styles.list}>
        {entries.map(({ adapter, installed }) => (
          <Pressable
            key={adapter.id}
            onPress={() => onSelect(adapter)}
            accessibilityRole="button"
            accessibilityLabel={`Connect ${adapter.name}`}
            accessibilityState={{ disabled: !installed }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.colors.surface.card },
              pressed && { opacity: 0.7 },
            ]}
          >
            <WalletIcon adapter={adapter} />
            <View style={styles.rowText}>
              <Text variant="body" weight="semibold">
                {adapter.name}
              </Text>
              <Text variant="caption">
                {adapter.tagline ?? formatNamespaces(adapter.namespaces)}
                {!installed && ' · not installed'}
              </Text>
            </View>
            {installed && (
              <View style={styles.check}>
                <CircleCheck
                  size={20}
                  color="#ffffff"
                  fill={theme.colors.feedback.success.base}
                />
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  rowText: { gap: 2, flex: 1 },
  check: { paddingHorizontal: 4 },
})
