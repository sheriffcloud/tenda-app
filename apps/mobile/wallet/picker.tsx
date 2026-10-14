import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { CircleCheck } from 'lucide-react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'
import { adapters } from './adapters/registry'
import type { WalletAdapter } from './adapters/types'
import type { ChainNamespace } from '@tenda/shared'
import { WalletIcon } from './wallet-icon'

interface WalletPickerProps {
  visible: boolean
  onClose: () => void
  onSelect: (adapter: WalletAdapter) => void
  /**
   * Offer only transports that can talk to this namespace. Omit to offer every
   * available one (sign-in and wallet-linking, where the chain is not decided
   * yet). A SIGNING surface must pass it: an EVM escrow cannot be signed by a
   * Solana wallet, so offering one buys a refusal the user cannot act on.
   */
  namespace?: ChainNamespace
}

interface PickerEntry {
  adapter: WalletAdapter
  installed: boolean
}

/**
 * Nothing on this device can talk to what was asked for — an EVM escrow on a
 * build with no WalletConnect project id, say. Said rather than left blank: a
 * sheet titled "Connect a wallet" with no rows in it is a dead end the reader
 * cannot even name. The namespace is named when there is one to name.
 */
const NO_TRANSPORT = (ns: ChainNamespace | undefined) =>
  ns === undefined
    ? 'No wallet app on this device can connect.'
    : `No wallet app on this device can sign on ${formatNamespaces([ns])}.`

function formatNamespaces(ns: readonly ChainNamespace[]): string {
  return ns.map((n) => (n === 'eip155' ? 'EVM' : 'Solana')).join(' + ')
}

export function WalletPicker({ visible, onClose, onSelect, namespace }: WalletPickerProps) {
  const { theme } = useUnistyles()
  // `null` while the availability probes are still out — distinct from the
  // empty array, so the empty state cannot flash before the answer arrives.
  const [entries, setEntries] = useState<PickerEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const offered =
      namespace === undefined ? adapters : adapters.filter((a) => a.namespaces.includes(namespace))
    Promise.all(
      offered.map(async (a) => {
        try {
          const [available, installed] = await Promise.all([a.isAvailable(), a.isInstalled()])
          return available ? { adapter: a, installed } : null
        } catch {
          // Per adapter, because one rejection inside `Promise.all` rejects the
          // whole batch: `entries` would stay null, and the sheet would sit
          // blank forever without even the dead-end line — one broken transport
          // hiding every working one. No adapter shipped today can reject (they
          // read `Platform.OS`, a build flag, or `canOpenScheme`, which catches
          // its own), but the registry exists so new ones plug in, and the
          // interface only promises a `Promise<boolean>`. Failing closed —
          // a transport that cannot answer is one we cannot offer — matches
          // `canOpenScheme` itself.
          return null
        }
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
  }, [namespace])

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Connect a wallet">
      <View style={styles.list}>
        {entries !== null && entries.length === 0 && (
          <Text variant="caption" color={theme.colors.content.secondary}>
            {NO_TRANSPORT(namespace)}
          </Text>
        )}
        {(entries ?? []).map(({ adapter, installed }) => (
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
                  fill={theme.colors.feedback.success.solid}
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
