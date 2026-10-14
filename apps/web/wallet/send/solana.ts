/**
 * Solana transaction transport: sign in the connected wallet, broadcast
 * app-side through the shared resilient RPC transport (mobile parity — the
 * wallet never picks the RPC; retries, failover, lost-response recovery and
 * the signature-match assertion are the shared transport's).
 *
 * web3.js and bs58 load lazily: they enter the JS graph only when a Solana
 * transaction is actually signed, never on page load.
 */
import {
  WalletError,
  TRANSACTION_COPY,
  createSolanaRpcTransport,
  isRetryableSolanaRpcError,
  resolveHttpRpcEndpoints,
  solanaPublicRpcUrl,
  type SolanaRpcTransport,
} from '@tenda/shared'
import { WALLET_CHAINS } from '../config'
import { requireTxModal, guardTxRequest, type SolanaTxProvider } from './session'

/**
 * Ordered public RPC endpoints. NEXT_PUBLIC_* must be referenced literally
 * for Next's build inlining (the shared-module env landmine from S3).
 * Default = the shared cluster URL for this build's configured chain.
 */
export function resolveSolanaPublicRpcEndpoints(
  env: Readonly<Record<string, string | undefined>> = {
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_SOLANA_RPC_URL_FALLBACK: process.env.NEXT_PUBLIC_SOLANA_RPC_URL_FALLBACK,
  },
): readonly string[] {
  const defaultPrimaryUrl = solanaPublicRpcUrl(WALLET_CHAINS.solana)
  if (defaultPrimaryUrl === null) {
    throw new Error(`no public Solana RPC known for ${WALLET_CHAINS.solana}`)
  }
  return resolveHttpRpcEndpoints({
    primaryUrl: env.NEXT_PUBLIC_SOLANA_RPC_URL,
    fallbackUrl: env.NEXT_PUBLIC_SOLANA_RPC_URL_FALLBACK,
    defaultPrimaryUrl,
    primaryName: 'NEXT_PUBLIC_SOLANA_RPC_URL',
    fallbackName: 'NEXT_PUBLIC_SOLANA_RPC_URL_FALLBACK',
  })
}

let transport: SolanaRpcTransport | null = null

/** The shared transport over web's endpoints + a web3.js Connection factory. */
async function solanaTransport(): Promise<SolanaRpcTransport> {
  if (transport === null) {
    const { Connection } = await import('@solana/web3.js')
    transport = createSolanaRpcTransport(resolveSolanaPublicRpcEndpoints(), (endpoint) => {
      // 'confirmed' end to end + history-aware reads — the same contract
      // mobile's factory pins (and its factory test asserts).
      const connection = new Connection(endpoint, 'confirmed')
      return {
        sendRawTransaction: (raw) => connection.sendRawTransaction(raw, { preflightCommitment: 'confirmed' }),
        getSignatureStatus: (signature) => connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
      }
    })
  }
  return transport
}

/** Test seam: forget the cached transport (endpoints are env-derived). */
export function resetSolanaTransportForTests(): void {
  transport = null
}

/** Solana signature status for the monitor's RPC fallback. */
export async function getSolanaTransactionStatus(signature: string) {
  return (await solanaTransport()).getTransactionStatus(signature)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Sign a server-built unsigned tx in the connected wallet, then broadcast it
 * app-side. Returns the base58 signature (the tx_ref). The sign leg rides
 * the request guard (Cancel + timeout); an ambiguous broadcast failure maps
 * to the shared "may still confirm" copy, since the server's verifier owns
 * the truth for broadcast-but-unreported transactions.
 */
export async function signAndSendSolanaTx(txBase64: string, onSigned?: () => void): Promise<string> {
  const modal = await requireTxModal()
  const provider = modal.getProvider<SolanaTxProvider>('solana')
  if (provider === undefined) {
    throw new WalletError('network', 'No Solana wallet connected, connect one first')
  }
  const { VersionedTransaction } = await import('@solana/web3.js')
  const tx = VersionedTransaction.deserialize(base64ToBytes(txBase64))
  const signed = await guardTxRequest(provider.signTransaction(tx))
  const signatureBytes = signed.signatures[0]
  if (signatureBytes === undefined) {
    throw new WalletError('unknown', 'Wallet returned a transaction without a signature')
  }
  const { default: bs58 } = await import('bs58')
  const signature = bs58.encode(signatureBytes)
  onSigned?.()
  try {
    return await (await solanaTransport()).broadcast(signed.serialize(), signature)
  } catch (error) {
    if (isRetryableSolanaRpcError(error)) {
      throw new WalletError('network', TRANSACTION_COPY.solanaBroadcastUncertain, error)
    }
    throw error
  }
}
