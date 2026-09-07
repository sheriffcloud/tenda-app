/**
 * useEscrowActions (web) — the v2 transition client leg: balance pre-flight
 * ordering for value-moving actions only, the 9D gate over the REAL shared
 * classifier, takedown-refusal re-reads, declined-guard exits, the two-phase
 * proof submit with the per-chain digest, and the dispute bond permit.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiClientError, PROOF_COPY, TRANSACTION_GATE_MESSAGE, WalletError } from '@tenda/shared'
import { proofHashFor } from '@/hooks/escrow/proof-hash'
import { useEscrowActions } from '@/hooks/escrow/useEscrowActions'

const { mockPush, mockToast, mockSign, mockResolveSigners, mockEnsure, mockPreconditions, mockBuildPermitFor, mockDeclaredSigner, mockConnectAs, storeMocks, persistMock, attachedMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockToast: vi.fn(),
  mockSign: vi.fn(),
  mockResolveSigners: vi.fn(),
  mockEnsure: vi.fn(),
  mockPreconditions: vi.fn(),
  mockBuildPermitFor: vi.fn(),
  mockDeclaredSigner: vi.fn(),
  mockConnectAs: vi.fn(),
  persistMock: vi.fn(),
  attachedMock: vi.fn(),
  storeMocks: {
    requestBuildCreate: vi.fn(),
    requestAccept: vi.fn(),
    requestDecline: vi.fn(),
    requestAssign: vi.fn(),
    requestUnassign: vi.fn(),
    requestSubmit: vi.fn(),
    requestApprove: vi.fn(),
    requestClaim: vi.fn(),
    requestCancel: vi.fn(),
    requestRefund: vi.fn(),
    requestDispute: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
vi.mock('@/wallet/dispatch', () => ({
  signSendAndReport: (...a: unknown[]) => mockSign(...a),
  resolveSignersForChain: (...a: unknown[]) => mockResolveSigners(...a),
  ensureTxPreconditions: (...a: unknown[]) => mockPreconditions(...a),
  declaredSignerFor: (...a: unknown[]) => mockDeclaredSigner(...a),
}))
vi.mock('@/wallet/send', () => ({
  connectAsWallet: (...a: unknown[]) => mockConnectAs(...a),
}))
vi.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsure(...a),
}))
vi.mock('@/wallet/permit', () => ({ buildPermitFor: (...a: unknown[]) => mockBuildPermitFor(...a) }))
vi.mock('@/lib/uploads/escrow-proofs', () => ({
  persistEscrowProofs: (...a: unknown[]) => persistMock(...a),
  attachedProofUrls: (...a: unknown[]) => attachedMock(...a),
}))
vi.mock('@/stores/escrow.store', () => ({
  useEscrowStore: Object.assign(() => storeMocks, { getState: () => storeMocks }),
}))

const ARGS = { escrowId: 'e1', chainId: 'eip155:84532', asset: 'USDC_BASE', amountRaw: '10000000' }
const UNSIGNED = { kind: 'evm-tx' as const, to: '0x1', data: '0x', value: '0' }
const SIGNERS = ['0xabc', '0xsecond']

beforeEach(() => {
  mockSign.mockResolvedValue('sig-1')
  mockResolveSigners.mockReturnValue(SIGNERS)
  mockEnsure.mockResolvedValue(undefined)
  mockBuildPermitFor.mockResolvedValue(undefined)
  // The declared signer (signer contract) rides every free/dispute build.
  mockDeclaredSigner.mockReturnValue('0xMine')
  persistMock.mockResolvedValue(undefined)
  attachedMock.mockResolvedValue([])
  for (const fn of Object.values(storeMocks)) fn.mockResolvedValue(UNSIGNED)
})

describe('proofHashFor', () => {
  test('base58 digest for Solana chains, 0x-hex for EVM — over the joined URLs', () => {
    const urls = ['https://cdn/a.jpg', 'https://cdn/b.pdf']
    const evm = proofHashFor('eip155:84532', urls)
    const sol = proofHashFor('solana:devnet', urls)
    expect(evm).toMatch(/^0x[0-9a-f]{64}$/)
    expect(sol).not.toMatch(/^0x/)
    // Order-sensitive: the digest commits to upload order.
    expect(proofHashFor('eip155:84532', [...urls].reverse())).not.toBe(evm)
  })

  test('golden vectors: sha256 over the \\n-joined URLs (cross-client on-chain commitment)', () => {
    // Fixed expected values — NOT recomputed with the same code path — so a
    // drifted separator, encoder, or hash silently changing the on-chain
    // commitment fails here (mobile pins the identical vectors).
    const urls = ['https://res.example/proof-1.png', 'https://res.example/proof-2.pdf']
    expect(proofHashFor('eip155:84532', urls)).toBe(
      '0x03be519bee2bbf8290b34f9e516330c549e27518262a8b7baa092ad3fd0c83d8',
    )
    expect(proofHashFor('solana:devnet', urls)).toBe(
      'FcYSG9dyCYy3bxfpi6tGbRduTgXUjW8vBaQuHBmTc9D',
    )
    // A single URL commits to itself with no separator involved.
    expect(proofHashFor('eip155:8453', [urls[0]])).toBe(
      '0xaf1049e251ccaca12739d411be0c85e79136c53bb20c1ccb14012c9c1bcc281d',
    )
  })
})

describe('action → builder → reported-action map', () => {
  test('every thin action calls ITS builder and pings the matching action name', async () => {
    // The mapping is consensus-critical: verify-tx cross-checks the pinged
    // action against the on-chain event, so a swapped pair would break
    // verification even though a valid tx was signed.
    type Actions = ReturnType<typeof useEscrowActions>
    const cases: ReadonlyArray<{
      run: (a: Actions) => Promise<boolean>
      builder: ReturnType<typeof vi.fn>
      builderArgs: readonly unknown[]
      reported: string
    }> = [
      { run: (a) => a.publish(), builder: storeMocks.requestBuildCreate, builderArgs: ['e1', '0xMine'], reported: 'create' },
      { run: (a) => a.accept(), builder: storeMocks.requestAccept, builderArgs: ['e1', '0xMine'], reported: 'accept' },
      { run: (a) => a.decline(), builder: storeMocks.requestDecline, builderArgs: ['e1'], reported: 'decline' },
      { run: (a) => a.assign('worker-9'), builder: storeMocks.requestAssign, builderArgs: ['e1', 'worker-9'], reported: 'assign_accept' },
      { run: (a) => a.unassign(), builder: storeMocks.requestUnassign, builderArgs: ['e1'], reported: 'unassign' },
      { run: (a) => a.approve(), builder: storeMocks.requestApprove, builderArgs: ['e1'], reported: 'approve' },
      { run: (a) => a.claim(), builder: storeMocks.requestClaim, builderArgs: ['e1'], reported: 'claim_stalled' },
      { run: (a) => a.cancel(), builder: storeMocks.requestCancel, builderArgs: ['e1'], reported: 'cancel' },
      { run: (a) => a.refund('refund_expired'), builder: storeMocks.requestRefund, builderArgs: ['e1'], reported: 'refund_expired' },
      { run: (a) => a.refund('reclaim_abandoned'), builder: storeMocks.requestRefund, builderArgs: ['e1'], reported: 'reclaim_abandoned' },
    ]
    for (const { run, builder, builderArgs, reported } of cases) {
      builder.mockResolvedValue(UNSIGNED)
      mockSign.mockClear()
      const { result } = renderHook(() => useEscrowActions(ARGS))
      let ok = false
      await act(async () => {
        ok = await run(result.current)
      })
      expect(ok).toBe(true)
      expect(builder).toHaveBeenCalledWith(...builderArgs)
      expect(mockSign).toHaveBeenCalledWith(
        expect.objectContaining({ action: reported, chain_id: ARGS.chainId, escrow_id: 'e1' }),
      )
    }
  })

  test('publish is the only thin action that pre-flights the FULL escrow amount', async () => {
    storeMocks.requestBuildCreate.mockResolvedValue(UNSIGNED)
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.publish()
    })
    expect(mockEnsure).toHaveBeenCalledWith(
      expect.objectContaining({ amountRaw: ARGS.amountRaw, owners: SIGNERS }),
    )
  })
})

describe('dispatch lifecycle', () => {
  test('accept: no balance read (moves nothing), phases build → confirm, onBroadcast fires', async () => {
    const onBroadcast = vi.fn()
    const { result } = renderHook(() => useEscrowActions({ ...ARGS, onBroadcast }))
    await act(async () => {
      await result.current.accept()
    })
    expect(mockEnsure).not.toHaveBeenCalled()
    expect(storeMocks.requestAccept).toHaveBeenCalledWith('e1', '0xMine')
    expect(mockSign).toHaveBeenCalledWith(
      expect.objectContaining({ unsigned: UNSIGNED, action: 'accept', chain_id: ARGS.chainId, escrow_id: 'e1' }),
    )
    expect(onBroadcast).toHaveBeenCalledWith('sig-1', 'accept')
    expect(result.current.pendingTxRef).toBe('sig-1')
    expect(result.current.phase).toBe('confirming')
  })

  test('publish debits the full amount — the balance pre-flight runs FIRST', async () => {
    const order: string[] = []
    mockEnsure.mockImplementation(async () => {
      order.push('balance')
    })
    storeMocks.requestBuildCreate.mockImplementation(async () => {
      order.push('build')
      return UNSIGNED
    })
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.publish()
    })
    expect(mockEnsure).toHaveBeenCalledWith({
      chainId: ARGS.chainId,
      assetId: ARGS.asset,
      amountRaw: ARGS.amountRaw,
      owners: SIGNERS,
    })
    expect(order).toEqual(['balance', 'build'])
    // And the trust list + chain registry load before the balance read —
    // without them the owner set is [] and the pre-flight falls open.
    expect(mockPreconditions.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsure.mock.invocationCallOrder[0],
    )
  })

  test('the 9D gate routes and never reaches the wallet', async () => {
    storeMocks.requestAccept.mockRejectedValue(
      new ApiClientError(403, 'Forbidden', 'no wallet', 'WALLET_REQUIRED'),
    )
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.accept()).toBe(false)
    })
    expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
    expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
    expect(mockSign).not.toHaveBeenCalled()
  })

  test('a guard decline is an info exit, not a failure', async () => {
    mockSign.mockRejectedValue(new WalletError('declined', 'Transaction cancelled.'))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.approve()).toBe(false)
    })
    expect(mockToast).toHaveBeenCalledWith('info', 'Transaction cancelled.')
    expect(result.current.phase).toBe('idle')
  })

  test('a takedown refusal re-reads the screen (onStale) with the server message', async () => {
    const onStale = vi.fn()
    storeMocks.requestAccept.mockRejectedValue(
      new ApiClientError(409, 'Conflict', 'listing was removed', 'ESCROW_TAKEN_DOWN'),
    )
    const { result } = renderHook(() => useEscrowActions({ ...ARGS, onStale }))
    await act(async () => {
      await result.current.accept()
    })
    expect(mockToast).toHaveBeenCalledWith('error', 'listing was removed')
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  test('any other failure is a generic error toast and resets the phase', async () => {
    storeMocks.requestCancel.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.cancel()).toBe(false)
    })
    expect(mockToast).toHaveBeenCalledWith('error', 'boom')
    expect(result.current.phase).toBe('idle')
  })

  test('a thrown NON-error still reaches the user rather than crashing the handler', async () => {
    // `throw null` is legal, and a rejected promise can carry anything — an
    // `as Error` cast on the way to `.message` throws INSIDE the failure
    // handler, replacing the toast with an unhandled rejection. Read through
    // `errorMessage` so the value simply has no words of its own and the
    // fallback speaks. Mobile's twin lives in useEscrowActions.takedown.test.
    storeMocks.requestCancel.mockRejectedValue(null)
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.cancel()).toBe(false)
    })
    expect(mockToast).toHaveBeenCalledWith('error', 'Transaction failed, please try again')
    expect(result.current.phase).toBe('idle')
  })

  test('refund passes the exact recovery kind through as the PING action', async () => {
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.refund('reclaim_abandoned')
    })
    expect(mockSign).toHaveBeenCalledWith(expect.objectContaining({ action: 'reclaim_abandoned' }))
  })
})

describe('proof submit (two-phase)', () => {
  const PROOFS = [{ url: 'https://cdn/a.jpg', type: 'image' as const }]

  test('persists the satellite rows FIRST, then commits the digest on-chain', async () => {
    attachedMock.mockResolvedValue(['https://cdn/a.jpg'])
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(true)
    })
    expect(persistMock).toHaveBeenCalledWith('e1', PROOFS)
    expect(storeMocks.requestSubmit).toHaveBeenCalledWith('e1', proofHashFor(ARGS.chainId, ['https://cdn/a.jpg']))
  })

  test('seals the escrow\'s WHOLE evidence set, not just the batch handed in', async () => {
    // The old basis was the batch, which made the digest mean "the last
    // upload": a worker who added a photo, then a receipt, then submitted
    // sealed only the receipt.
    const stored = ['https://cdn/earlier.jpg', 'https://cdn/a.jpg']
    attachedMock.mockResolvedValue(stored)
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(true)
    })
    expect(attachedMock).toHaveBeenCalledWith('e1')
    expect(storeMocks.requestSubmit).toHaveBeenCalledWith('e1', proofHashFor(ARGS.chainId, stored))
    // …and that is genuinely a different commitment from the batch alone.
    expect(proofHashFor(ARGS.chainId, stored)).not.toBe(
      proofHashFor(ARGS.chainId, ['https://cdn/a.jpg']),
    )
  })

  test('RETRIES with nothing new picked: no upload, and the stored set is sealed', async () => {
    // The failure this fixes: the upload leg succeeded and the transaction leg
    // did not (a declined wallet). Re-uploading the same files to retry the
    // signature is asking for the expensive half again — and the POST rejects
    // an empty batch, so it must not be called at all.
    const stored = ['https://cdn/a.jpg', 'https://cdn/b.pdf']
    attachedMock.mockResolvedValue(stored)
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit([])).toBe(true)
    })
    expect(persistMock).not.toHaveBeenCalled()
    expect(storeMocks.requestSubmit).toHaveBeenCalledWith('e1', proofHashFor(ARGS.chainId, stored))
  })

  test('a failed persist never reaches the chain', async () => {
    persistMock.mockRejectedValue(new Error('satellite down'))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(false)
    })
    expect(storeMocks.requestSubmit).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('error', 'satellite down')
  })

  test('a message-less READ-BACK failure does not claim the upload failed', async () => {
    // Reachable: `request()` builds ApiClientError from `error.message` of the
    // parsed body, so any intermediary answering a JSON envelope without a
    // `message` (a gateway 502) lands on the fallback string. Sharing the
    // persist leg's fallback told a worker their files failed to save at the
    // one moment the files are the thing that DID save.
    attachedMock.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(false)
    })
    expect(storeMocks.requestSubmit).not.toHaveBeenCalled()
    const [[level, message]] = mockToast.mock.calls.slice(-1)
    expect(level).toBe('error')
    expect(message).not.toMatch(/save/i)
    expect(message).toMatch(/proof/i)
  })

  test('a message-less PERSIST failure still says the save failed', async () => {
    // The other half of the pair: the two legs must not swap messages.
    persistMock.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(false)
    })
    expect(attachedMock).not.toHaveBeenCalled()
    // The SHARED sentence, never a local restatement — a check-in was never a file.
    expect(mockToast).toHaveBeenCalledWith('error', PROOF_COPY.saveFailed)
  })

  test('a failed READ-BACK never reaches the chain either', async () => {
    // Signing a digest over a set we could not read would seal the wrong
    // thing — and the files are stored, so the retry costs the worker nothing.
    attachedMock.mockRejectedValue(new Error('proofs unreadable'))
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.submit(PROOFS)).toBe(false)
    })
    expect(storeMocks.requestSubmit).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('error', 'proofs unreadable')
  })

  test('addProofs is off-chain only', async () => {
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      expect(await result.current.addProofs(PROOFS)).toBe(true)
    })
    expect(storeMocks.requestSubmit).not.toHaveBeenCalled()
    expect(mockSign).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('success', 'Proof added!')
  })
})

describe('wrong-wallet retry (signer contract)', () => {
  const wrongWallet = () =>
    new ApiClientError(422, 'Unprocessable Entity', 'must be signed by 0xBound', 'ESCROW_WRONG_WALLET', {
      required_address: '0xBound',
    })

  test('a bound-mismatch refusal connects the REQUIRED wallet and re-runs the build once', async () => {
    storeMocks.requestSubmit.mockRejectedValueOnce(wrongWallet()).mockResolvedValueOnce(UNSIGNED)
    mockConnectAs.mockResolvedValue('0xBound')
    const { result } = renderHook(() => useEscrowActions(ARGS))
    let ok = false
    await act(async () => {
      ok = await result.current.submit([])
    })
    expect(ok).toBe(true)
    expect(mockConnectAs).toHaveBeenCalledWith('eip155', '0xBound')
    expect(storeMocks.requestSubmit).toHaveBeenCalledTimes(2)
    expect(mockSign).toHaveBeenCalledTimes(1)
  })

  test('a refusal WITHOUT a required address (unlinked caller wallet) is not retried', async () => {
    storeMocks.requestAccept.mockRejectedValue(
      new ApiClientError(422, 'Unprocessable Entity', 'not one of your linked wallets', 'ESCROW_WRONG_WALLET'),
    )
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.accept()
    })
    expect(mockConnectAs).not.toHaveBeenCalled()
    expect(storeMocks.requestAccept).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('error', 'not one of your linked wallets')
  })

  test('a failed targeted connect surfaces ITS message and never re-requests', async () => {
    storeMocks.requestApprove.mockRejectedValue(wrongWallet())
    mockConnectAs.mockRejectedValue(
      new WalletError('no_wallet', 'Connect 0xBo…und — the wallet this escrow is signed by — to continue'),
    )
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.approve()
    })
    expect(storeMocks.requestApprove).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('error', expect.stringContaining('the wallet this escrow is signed by'))
    expect(mockSign).not.toHaveBeenCalled()
  })
})

describe('dispute', () => {
  test('a bonded dispute debits the bond and rides the permit path', async () => {
    const permit = { value_raw: '500', deadline_unix: 1, signature: '0xsig' }
    mockBuildPermitFor.mockResolvedValue(permit)
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.dispute('late delivery', '500')
    })
    expect(mockEnsure).toHaveBeenCalledWith(expect.objectContaining({ amountRaw: '500' }))
    expect(mockBuildPermitFor).toHaveBeenCalledWith({
      chain_id: ARGS.chainId,
      asset: ARGS.asset,
      value_raw: '500',
    })
    expect(storeMocks.requestDispute).toHaveBeenCalledWith('e1', '500', 'late delivery', permit, '0xMine')
  })

  test('a zero bond skips the permit entirely', async () => {
    const { result } = renderHook(() => useEscrowActions(ARGS))
    await act(async () => {
      await result.current.dispute('late delivery', '0')
    })
    expect(mockBuildPermitFor).not.toHaveBeenCalled()
    expect(storeMocks.requestDispute).toHaveBeenCalledWith('e1', '0', 'late delivery', undefined, '0xMine')
  })
})
