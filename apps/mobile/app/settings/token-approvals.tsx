import { useCallback, useState } from 'react'
import { View, StyleSheet, ScrollView } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Text, Header, Button, BottomSheet, ConfirmDialog, Input, showToast } from '@/components/ui'
import { AllowanceRow, type AllowanceRowData } from '@/components/settings/AllowanceRow'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { resolveEvmFrom } from '@/wallet/dispatch'
import {
  displayToAmountRaw,
  readAllowance,
  sendApprove,
  waitForReceipt,
} from '@/wallet/allowance'
import { spacing } from '@/theme/tokens'

/**
 * Settings → Token approvals: every standing ERC-20 allowance this wallet
 * has granted the escrow contract, per enabled EVM chain, view, set a
 * custom limit, or revoke, independent of any escrow flow. (Escrow creation
 * itself signs exact-value permits or approves per amount; residual
 * allowances usually come from over-permits or manual limits set here.)
 */
export default function TokenApprovalsScreen() {
  const { theme } = useUnistyles()
  const chains = useChainRegistryStore((s) => s.chains)
  const owner = resolveEvmFrom()
  const [rows, setRows] = useState<AllowanceRowData[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<AllowanceRowData | null>(null)
  const [setTarget, setSetTarget] = useState<AllowanceRowData | null>(null)
  const [amountInput, setAmountInput] = useState('')

  const rowKey = (r: Pick<AllowanceRowData, 'chainId' | 'assetId'>) => `${r.chainId}:${r.assetId}`

  const load = useCallback(async () => {
    if (owner === null || chains === null) return
    const base: AllowanceRowData[] = chains
      .filter((c) => c.namespace === 'eip155')
      .flatMap((c) =>
        c.assets.flatMap((a) =>
          a.token_address === null
            ? []
            : [
                {
                  chainId: c.id,
                  chainName: c.display_name,
                  assetId: a.id,
                  symbol: a.symbol,
                  decimals: a.decimals,
                  token: a.token_address,
                  spender: c.escrow_address,
                  allowanceRaw: null,
                },
              ],
        ),
      )
    setRows(base)
    const settled = await Promise.allSettled(
      base.map((r) =>
        readAllowance({ chainId: r.chainId, token: r.token, owner, spender: r.spender }),
      ),
    )
    setRows(
      base.map((r, i) => {
        const result = settled[i]
        return {
          ...r,
          allowanceRaw: result?.status === 'fulfilled' ? result.value : ('error' as const),
        }
      }),
    )
  }, [chains, owner])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function applyApproval(row: AllowanceRowData, amountRaw: string, doneMsg: string) {
    if (owner === null) return
    setBusyKey(rowKey(row))
    try {
      const txHash = await sendApprove({
        chainId: row.chainId,
        token: row.token,
        spender: row.spender,
        amountRaw,
        from: owner,
      })
      const outcome = await waitForReceipt({ chainId: row.chainId, txHash })
      if (outcome === 'reverted') {
        showToast('error', 'The approval transaction reverted')
      } else {
        showToast(outcome === 'confirmed' ? 'success' : 'info', doneMsg)
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setBusyKey(null)
      void load()
    }
  }

  function submitCustomAmount() {
    if (setTarget === null) return
    const raw = displayToAmountRaw(amountInput, setTarget.decimals)
    if (raw === null) {
      showToast('error', `Enter a valid ${setTarget.symbol} amount (max ${setTarget.decimals} decimals)`)
      return
    }
    const target = setTarget
    setSetTarget(null)
    setAmountInput('')
    void applyApproval(target, raw, `Approval set to ${amountInput} ${target.symbol}`)
  }

  const hasEvmChains = chains !== null && chains.some((c) => c.namespace === 'eip155')

  return (
    <ScreenContainer>
      <Header title="Token approvals" showBack />
      <ScrollView contentContainerStyle={s.body}>
        <Text variant="caption" style={{ color: theme.colors.content.secondary }}>
          Standing spending limits you have granted the Tenda escrow contract. Escrow flows request
          exact amounts automatically, anything listed here stays spendable until you change it.
        </Text>
        {owner === null ? (
          <Text style={s.empty}>Link an EVM wallet to view its token approvals.</Text>
        ) : chains === null ? (
          <Text style={s.empty}>Loading chains…</Text>
        ) : !hasEvmChains ? (
          <Text style={s.empty}>No EVM chains are enabled right now.</Text>
        ) : (
          <View>
            {rows.map((row) => (
              <AllowanceRow
                key={rowKey(row)}
                row={row}
                busy={busyKey === rowKey(row)}
                onSet={(r) => {
                  setAmountInput('')
                  setSetTarget(r)
                }}
                onRevoke={(r) => setRevokeTarget(r)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={revokeTarget !== null}
        title="Revoke approval?"
        message={
          revokeTarget !== null
            ? `The escrow contract will no longer be able to spend your ${revokeTarget.symbol} on ${revokeTarget.chainName} until you approve again.`
            : ''
        }
        confirmLabel="Revoke"
        destructive
        onConfirm={() => {
          const target = revokeTarget
          setRevokeTarget(null)
          if (target !== null) void applyApproval(target, '0', 'Approval revoked')
        }}
        onCancel={() => setRevokeTarget(null)}
      />

      <BottomSheet
        visible={setTarget !== null}
        onClose={() => setSetTarget(null)}
        title={`Set ${setTarget?.symbol ?? ''} limit · ${setTarget?.chainName ?? ''}`}
      >
        <View style={s.sheet}>
          <Text variant="caption" style={{ color: theme.colors.content.secondary }}>
            The maximum the escrow contract may spend from your wallet. The wallet will ask you to
            confirm the approval transaction.
          </Text>
          <Input
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder={`Amount in ${setTarget?.symbol ?? ''}`}
            keyboardType="decimal-pad"
          />
          <Button variant="primary" onPress={submitCustomAmount}>
            Approve
          </Button>
        </View>
      </BottomSheet>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  empty: { paddingVertical: spacing.xl, textAlign: 'center' },
  sheet: { padding: spacing.lg, gap: spacing.md },
})
