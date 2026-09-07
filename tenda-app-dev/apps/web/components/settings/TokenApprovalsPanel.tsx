'use client'

/**
 * Settings → Token approvals — web port of mobile's app/settings/
 * token-approvals screen: every standing ERC-20 allowance this wallet has
 * granted the escrow contract, per enabled EVM chain; view, set a custom
 * limit, or revoke, independent of any escrow flow. (Escrow creation itself
 * signs exact-value permits or approves per amount; residual allowances
 * usually come from over-permits or manual limits set here.)
 */
import { useCallback, useEffect, useState } from 'react'
import { displayToAmountRaw, readAllowance, sendApprove, waitForReceipt } from '@tenda/shared'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { resolveEvmFrom } from '@/wallet/dispatch'
import { sendEvmTransaction } from '@/wallet/send/evm'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'
import { controlClassName } from '@/components/ui/TextField'
import { AllowanceRow, type AllowanceRowData } from './AllowanceRow'

function rowKey(r: Pick<AllowanceRowData, 'chainId' | 'assetId'>): string {
  return `${r.chainId}:${r.assetId}`
}

export function TokenApprovalsPanel() {
  const chains = useChainRegistryStore((s) => s.chains)
  const load = useChainRegistryStore((s) => s.fetch)
  const owner = resolveEvmFrom()
  const [rows, setRows] = useState<AllowanceRowData[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<AllowanceRowData | null>(null)
  const [setTarget, setSetTarget] = useState<AllowanceRowData | null>(null)
  const [amountInput, setAmountInput] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  const loadRows = useCallback(async () => {
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

  useEffect(() => {
    void loadRows()
  }, [loadRows])

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
        // The transport seam: the approve rides the connected session.
        sendTx: sendEvmTransaction,
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
      void loadRows()
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
    <section className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-2 font-display text-2xl font-bold text-content-primary">Token approvals</h1>
      <p className="mb-6 text-sm text-content-secondary">
        Standing spending limits you have granted the Tenda escrow contract. Escrow flows request
        exact amounts automatically, anything listed here stays spendable until you change it.
      </p>
      {owner === null ? (
        <p className="py-10 text-center text-sm text-content-secondary">
          Link an EVM wallet to view its token approvals.
        </p>
      ) : chains === null ? (
        <p className="py-10 text-center text-sm text-content-secondary">Loading chains…</p>
      ) : !hasEvmChains ? (
        <p className="py-10 text-center text-sm text-content-secondary">
          No EVM chains are enabled right now.
        </p>
      ) : (
        <ul>
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
        </ul>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
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

      {setTarget !== null && (
        <ModalBackdrop
          label={`Set ${setTarget.symbol} limit`}
          onBackdropClick={() => setSetTarget(null)}
        >
            <h2 className="font-display text-lg font-bold text-content-primary">
              Set {setTarget.symbol} limit · {setTarget.chainName}
            </h2>
            <p className="text-sm text-content-secondary">
              The maximum the escrow contract may spend from your wallet. The wallet will ask you
              to confirm the approval transaction.
            </p>
            <input
              className={controlClassName}
              inputMode="decimal"
              aria-label={`Amount in ${setTarget.symbol}`}
              placeholder={`Amount in ${setTarget.symbol}`}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <Button variant="primary" onClick={submitCustomAmount}>
              Approve
            </Button>
        </ModalBackdrop>
      )}
    </section>
  )
}
