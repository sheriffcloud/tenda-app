/**
 * wallet-signature — the single, namespace-level auth-sig verifier shared by the
 * wallet auth strategy, the chain registry, and the per-chain adapters. Pure
 * offline crypto (no RPC), so login never needs a provisioned chain. Exercises
 * eip155 (EIP-191 ecrecover) + solana (ed25519), positive and negative, plus the
 * namespace gate.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { AppError } from '@server/lib/errors'
import {
  deriveChainNamespace,
  verifyWalletSignature,
  verifyEd25519,
} from '@server/lib/wallet-signature'

const MESSAGE = 'Tenda wants you to sign in with your wallet:\n0xabc\n\nNonce: n1'

test('deriveChainNamespace: maps supported CAIP-2 ids; 400 on unsupported namespace', () => {
  assert.equal(deriveChainNamespace('eip155:8453'), 'eip155')
  assert.equal(deriveChainNamespace('eip155:84532'), 'eip155')
  assert.equal(deriveChainNamespace('solana:devnet'), 'solana')
  assert.throws(() => deriveChainNamespace('cosmos:1'), (e: unknown) => {
    return e instanceof AppError && e.statusCode === 400
  })
})

test('eip155: a real EIP-191 personal_sign verifies; wrong address / garbage → false', async () => {
  const account = privateKeyToAccount(`0x${'07'.repeat(32)}`)
  const signature = await account.signMessage({ message: MESSAGE })

  assert.equal(await verifyWalletSignature('eip155', { address: account.address, message: MESSAGE, signature }), true)
  // wrong address
  assert.equal(
    await verifyWalletSignature('eip155', { address: `0x${'00'.repeat(20)}`, message: MESSAGE, signature }),
    false,
  )
  // garbage signature
  assert.equal(
    await verifyWalletSignature('eip155', { address: account.address, message: MESSAGE, signature: '0xdead' }),
    false,
  )
  // tampered message
  assert.equal(
    await verifyWalletSignature('eip155', { address: account.address, message: 'tampered', signature }),
    false,
  )
})

test('solana: a real ed25519 sig verifies; tampered message / wrong length → false', async () => {
  const kp = nacl.sign.keyPair()
  const address = bs58.encode(kp.publicKey)
  const signature = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(MESSAGE), kp.secretKey),
  ).toString('base64')

  assert.equal(await verifyWalletSignature('solana', { address, message: MESSAGE, signature }), true)
  // tampered message
  assert.equal(await verifyWalletSignature('solana', { address, message: 'tampered', signature }), false)
  // wrong-length signature (32 zero bytes)
  assert.equal(
    await verifyWalletSignature('solana', { address, message: MESSAGE, signature: Buffer.alloc(32).toString('base64') }),
    false,
  )
})

test('verifyEd25519: the re-exported helper matches the namespace verifier', async () => {
  const kp = nacl.sign.keyPair()
  const address = bs58.encode(kp.publicKey)
  const signature = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(MESSAGE), kp.secretKey),
  ).toString('base64')
  assert.equal(verifyEd25519({ address, message: MESSAGE, signature }), true)
})
