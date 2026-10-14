import { useCallback, useState } from 'react'
import { View, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Star, Unlink } from 'lucide-react-native'
import { CHAIN_NAMESPACE_LABEL, ErrorCode, type LinkedWallet, ApiClientError } from '@tenda/shared'
import { ScreenContainer, Text, Header, Button, BottomSheet, ConfirmDialog, showToast } from '@/components/ui'
import { WalletCard } from '@/components/onboarding/WalletCard'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { WalletError } from '@tenda/shared'
import { WalletPicker } from '@/wallet/picker'
import type { WalletAdapter } from '@/wallet/adapters/types'
import { useReturnToLinkedWallets } from '@/lib/post-auth-nav'
import { spacing } from '@/theme/tokens'

/**
 * Settings → Linked wallets (stage-1-onboarding.md § Linked-wallets UI).
 * Add = the same nonce + signature dance as sign-in (any adapter, Solana or
 * EVM, via the shared picker), against /v1/auth/link-wallet with
 * `forceFresh` so the user can pick a DIFFERENT account than the one on their
 * JWT. The server enforces the primary/sole/in-use unlink guards, this screen
 * just surfaces its answers.
 */
export default function LinkedWalletsScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()
  const wallets = useAuthStore((s) => s.wallets)
  const refreshMe = useAuthStore((s) => s.refreshMe)
  const linkWallet = useAuthStore((s) => s.linkWallet)
  const returnToLinkedWallets = useReturnToLinkedWallets()
  const [managing, setManaging] = useState<LinkedWallet | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedWallet | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useFocusEffect(
    useCallback(() => {
      void refreshMe()
    }, [refreshMe]),
  )

  async function handleLinkWallet(adapter: WalletAdapter) {
    setPickerVisible(false)
    setBusy(true)
    try {
      const linked = await linkWallet(adapter)
      if (!linked) {
        showToast('error', 'Wallet prompt was closed')
        return
      }
      showToast('success', 'Wallet linked')
      // The wallet's `tenda://` auto-return may have popped this screen to `/`
      // mid-link; rebuild the stack back onto it (its focus effect re-fetches
      // the now-updated wallets[]). No-op visually when we never left.
      returnToLinkedWallets()
    } catch (e) {
      if (e instanceof ApiClientError) showToast('error', e.message)
      else if (e instanceof WalletError && e.code === 'no_wallet') showToast('error', 'No wallet app installed')
      else showToast('error', 'Could not link the wallet, please try again')
    } finally {
      setBusy(false)
    }
  }

  async function handleSetPrimary(w: LinkedWallet) {
    setManaging(null)
    try {
      await api.auth.setPrimaryWallet({ chain_ns: w.chain_ns, address: w.address })
      showToast('success', `Main ${CHAIN_NAMESPACE_LABEL[w.chain_ns]} wallet updated`)
      await refreshMe()
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not update your main wallet')
    }
  }

  function handleUnlink(w: LinkedWallet) {
    setManaging(null)
    setUnlinkTarget(w)
  }

  async function confirmUnlink() {
    const w = unlinkTarget
    if (w === null) return
    setUnlinking(true)
    try {
      await api.auth.unlinkWallet({ chain_ns: w.chain_ns, address: w.address })
      showToast('success', 'Wallet unlinked')
      await refreshMe()
      setUnlinkTarget(null)
    } catch (e) {
      if (e instanceof ApiClientError && e.code === ErrorCode.WALLET_IS_PRIMARY) {
        showToast('error', 'Make another wallet the main one for this chain first, then unlink this one')
      } else if (e instanceof ApiClientError && e.code === ErrorCode.WALLET_IN_USE) {
        showToast('error', 'This wallet is part of an active escrow, finish or cancel it first')
      } else {
        showToast('error', e instanceof ApiClientError ? e.message : 'Could not unlink the wallet')
      }
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Linked wallets" showBack onBackPress={() => router.back()} />

      <ScrollView contentContainerStyle={s.content}>
        <Text size={13} color={theme.colors.content.secondary} style={s.lede}>
          Any linked wallet can sign you in. You pick a main wallet for each
          chain, and payments on that chain go to it by default.
        </Text>

        <View style={s.list}>
          {wallets.map((w) => (
            <WalletCard key={`${w.chain_ns}:${w.address}`} wallet={w} onManage={() => setManaging(w)} />
          ))}
          {wallets.length === 0 && (
            <Text size={13} color={theme.colors.content.tertiary} align="center" style={s.empty}>
              No wallets loaded yet, pull to refresh or re-open this screen.
            </Text>
          )}
        </View>

        <Button
          variant="outline"
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => { if (!busy) setPickerVisible(true) }}
        >
          Add another wallet
        </Button>
      </ScrollView>

      <WalletPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleLinkWallet}
      />

      <ConfirmDialog
        visible={unlinkTarget !== null}
        title="Unlink wallet"
        message={
          unlinkTarget !== null
            ? `Remove ${unlinkTarget.address.slice(0, 6)}… from your account? You can re-link it later.`
            : undefined
        }
        confirmLabel="Unlink"
        destructive
        loading={unlinking}
        onConfirm={() => void confirmUnlink()}
        onCancel={() => setUnlinkTarget(null)}
      />

      <BottomSheet visible={managing !== null} onClose={() => setManaging(null)} title="Manage wallet">
        {managing !== null && (
          <>
            {!managing.is_primary && (
              <Pressable
                style={({ pressed }) => [s.menuItem, { borderTopColor: theme.colors.border.subtle }, pressed && { opacity: 0.7 }]}
                onPress={() => void handleSetPrimary(managing)}
                accessibilityRole="button"
                accessibilityLabel={`Make main ${CHAIN_NAMESPACE_LABEL[managing.chain_ns]} wallet`}
              >
                <View style={[s.menuIcon, { backgroundColor: theme.colors.brand.primarySurface }]}>
                  <Star size={18} color={theme.colors.brand.primary} />
                </View>
                <View style={s.menuBody}>
                  <Text size={15} weight="semibold">
                    Make main {CHAIN_NAMESPACE_LABEL[managing.chain_ns]} wallet
                  </Text>
                  <Text size={12.5} color={theme.colors.content.secondary}>
                    {CHAIN_NAMESPACE_LABEL[managing.chain_ns]} payments default to this
                    wallet. Your other chains are unaffected.
                  </Text>
                </View>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [s.menuItem, { borderTopColor: theme.colors.border.subtle }, pressed && { opacity: 0.7 }]}
              onPress={() => handleUnlink(managing)}
              accessibilityRole="button"
              accessibilityLabel="Unlink wallet"
            >
              <View style={[s.menuIcon, { backgroundColor: theme.colors.feedback.danger.surface }]}>
                <Unlink size={18} color={theme.colors.feedback.danger.base} />
              </View>
              <View style={s.menuBody}>
                <Text size={15} weight="semibold" color={theme.colors.feedback.danger.base}>
                  Unlink wallet
                </Text>
                <Text size={12.5} color={theme.colors.content.secondary}>
                  Not possible while it&apos;s your only wallet or part of an active escrow.
                </Text>
              </View>
            </Pressable>
          </>
        )}
      </BottomSheet>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  content: { padding: spacing.md, gap: 14 },
  lede: { lineHeight: 18 },
  list: { gap: 10 },
  empty: { paddingVertical: 20 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuBody: { flex: 1, gap: 3 },
})
