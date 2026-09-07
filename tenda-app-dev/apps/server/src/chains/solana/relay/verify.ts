/**
 * Pure checks over a partially signed relayed-create transaction: is it the
 * transaction the terms quoted, and did the creator sign it? No RPC here —
 * blockhash freshness and simulation are the relayer's (relay/index.ts).
 */
import { VersionedTransaction, type MessageV0, type PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { relayRejected as rejected } from '@server/lib/x402'

/** Parse the artifact's base64 into a versioned transaction, or refuse. */
export function deserializeArtifact(transaction_base64: string): VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(Buffer.from(transaction_base64, 'base64'))
  } catch {
    return rejected('transaction is not a base64-encoded versioned transaction')
  }
}

/**
 * The submitted transaction must be BYTE-IDENTICAL to the one the terms would
 * yield now (same instructions, same accounts, same fee payer), carrying
 * exactly two signers — the relayer's fee-payer slot and the creator — and
 * the creator's signature must verify over the message.
 */
export function assertRelayedMessage(args: {
  tx: VersionedTransaction
  expected: MessageV0
  relayer: PublicKey
  creator: PublicKey
}): void {
  const { tx, expected, relayer, creator } = args
  const msg = tx.message
  const keys = msg.staticAccountKeys
  if (keys[0] === undefined || !keys[0].equals(relayer)) rejected('fee payer must be the relayer')
  if (msg.header.numRequiredSignatures !== 2) rejected('exactly the relayer and the creator must sign')
  if (keys[1] === undefined || !keys[1].equals(creator)) rejected('the second signer must be the creator')
  if (!Buffer.from(expected.serialize()).equals(Buffer.from(msg.serialize()))) {
    rejected('transaction differs from the quoted terms — request fresh terms and sign those')
  }
  const signature = tx.signatures[1]
  if (signature === undefined || signature.every((b) => b === 0)) rejected('creator signature is missing')
  if (!nacl.sign.detached.verify(msg.serialize(), signature, creator.toBytes())) {
    rejected('creator signature does not verify over the transaction')
  }
}
