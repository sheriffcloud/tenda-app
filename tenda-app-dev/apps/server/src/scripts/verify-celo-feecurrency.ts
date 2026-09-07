/**
 * On-chain proof that Celo's USDC-gas (feeCurrency) path works with OUR
 * configured adapter — the half of the Celo lifecycle that no available wallet
 * can smoke-test (MiniPay/Valora are mainnet-only; every other wallet ignores
 * feeCurrency and pays native CELO). This is deterministic and vendor-free:
 * viem signs a CIP-64 transaction carrying `feeCurrency = <our adapter>` and we
 * assert, from balance deltas, that gas was debited in USDC and NOT in CELO.
 *
 *   CHAIN_EIP155_11142220_PRIVATE_KEY=0x... pnpm --filter server verify:celo-fee-currency
 *
 * The signer must hold USDC on Celo Sepolia (faucet.circle.com). It does NOT
 * need any native CELO — proving zero-CELO gas is the strongest form of the
 * claim, though the proof (native delta === 0) holds whatever the CELO balance.
 *
 * Config is read live: adapter + token from the shared CHAIN_MANIFEST, RPC from
 * .env (falling back to the manifest's public RPC). Nothing about the fee model
 * is hardcoded here, so this can't drift from what the server actually attaches
 * (evm/index.ts buildTx → `fee_currency`).
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  getAddress,
  isAddressEqual,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celoSepolia } from 'viem/chains'
import { chainById, feeCurrencyAddress, requireEvmPublicRpcUrl } from '@tenda/shared'

const CHAIN_ID = 'eip155:11142220'

// A Celo FeeCurrencyDirectory adapter wraps a non-18-decimal token (USDC = 6)
// as an 18-decimal gas token. adaptedToken() is the underlying ERC-20 it debits.
const ADAPTER_ABI = [
  { type: 'function', name: 'adaptedToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function requirePrivateKey(): Hex {
  const raw = process.env.CHAIN_EIP155_11142220_PRIVATE_KEY
  if (raw === undefined || raw === '') {
    throw new Error('CHAIN_EIP155_11142220_PRIVATE_KEY is not set (export the funded signer key)')
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('CHAIN_EIP155_11142220_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string')
  }
  return raw as Hex
}

async function main(): Promise<void> {
  // ---- resolve config from the manifest (source of truth) + env ------------
  const entry = chainById(CHAIN_ID)
  const adapter = feeCurrencyAddress(entry)
  assert(adapter !== null, `${CHAIN_ID} has no feeCurrency adapter in the manifest`)
  const feeAsset = entry.assets.find((a) => a.id === entry.feeCurrency)
  assert(
    feeAsset?.token != null,
    `${CHAIN_ID} feeCurrency asset '${entry.feeCurrency ?? '?'}' has no token address`,
  )
  const adapterAddr = getAddress(adapter as string)
  const manifestToken = getAddress(feeAsset!.token as string)
  const rpcUrl = process.env.CHAIN_EIP155_11142220_RPC_URL ?? requireEvmPublicRpcUrl(CHAIN_ID)

  const account = privateKeyToAccount(requirePrivateKey())
  const transport = http(rpcUrl)
  const publicClient = createPublicClient({ chain: celoSepolia, transport })
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport })

  console.log(`Chain      : ${entry.displayName} (${CHAIN_ID})`)
  console.log(`RPC        : ${rpcUrl}`)
  console.log(`Signer     : ${account.address}`)
  console.log(`Fee adapter: ${adapterAddr}`)

  // ---- 1. tie config to chain reality: adapter.adaptedToken() === our USDC --
  const adaptedToken = await publicClient.readContract({
    address: adapterAddr,
    abi: ADAPTER_ABI,
    functionName: 'adaptedToken',
  })
  assert(
    isAddressEqual(adaptedToken, manifestToken),
    `adapter.adaptedToken() ${adaptedToken} != manifest USDC token ${manifestToken} — the ` +
      `feeCurrencyAdapter in the manifest points at the wrong token`,
  )
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: manifestToken, abi: ERC20_ABI, functionName: 'decimals' }),
    publicClient.readContract({ address: manifestToken, abi: ERC20_ABI, functionName: 'symbol' }),
  ])
  console.log(`Gas token  : ${symbol} @ ${manifestToken} (${decimals} decimals) ✓ adapter matches manifest`)

  const balanceOf = (owner: Address): Promise<bigint> =>
    publicClient.readContract({ address: manifestToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })

  // ---- 2. snapshot balances BEFORE ----------------------------------------
  const [usdcBefore, nativeBefore] = await Promise.all([
    balanceOf(account.address),
    publicClient.getBalance({ address: account.address }),
  ])
  assert(
    usdcBefore > 0n,
    `signer holds 0 ${symbol} — fund it from a Celo Sepolia USDC faucet before running`,
  )
  console.log(
    `\nBefore     : ${formatUnits(usdcBefore, decimals)} ${symbol}, ${formatUnits(nativeBefore, 18)} CELO`,
  )

  // ---- 3. send a CIP-64 tx that pays gas in USDC via the adapter -----------
  // A 0-value self-transfer isolates the variable under test: the ONLY token
  // movement possible is gas. viem's celoSepolia serializer turns a request
  // with `feeCurrency` into a type-0x7b (CIP-64) transaction.
  console.log(`\nSending 0-value self-transfer with feeCurrency=${adapterAddr} ...`)
  const hash = await walletClient.sendTransaction({
    to: account.address,
    value: 0n,
    feeCurrency: adapterAddr,
  })
  console.log(`  tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  assert(receipt.status === 'success', `transaction reverted (status=${receipt.status})`)

  // ---- 4. snapshot balances AFTER + prove the claim ------------------------
  const [usdcAfter, nativeAfter] = await Promise.all([
    balanceOf(account.address),
    publicClient.getBalance({ address: account.address }),
  ])
  const usdcDelta = usdcBefore - usdcAfter
  const nativeDelta = nativeBefore - nativeAfter
  console.log(
    `After      : ${formatUnits(usdcAfter, decimals)} ${symbol}, ${formatUnits(nativeAfter, 18)} CELO`,
  )

  // The proof: gas came out of USDC, none out of CELO.
  assert(nativeDelta === 0n, `native CELO changed by ${nativeDelta} wei — gas was NOT paid in USDC`)
  assert(usdcDelta > 0n, `${symbol} did not decrease — no gas was debited from the fee currency`)

  // Corroboration (informational, not asserted): gasUsed × effectiveGasPrice is
  // denominated in the ADAPTER's 18-decimal units, while the balance debit is in
  // the token's ${decimals}-decimal units — the adapter converts between them, so
  // these two numbers are intentionally NOT numerically equal.
  const gasFee18 = receipt.gasUsed * receipt.effectiveGasPrice
  console.log(`\nGas used   : ${receipt.gasUsed}  @ ${receipt.effectiveGasPrice} (18-dec adapter units)`)
  console.log(`  → fee (adapter 18-dec): ${formatUnits(gasFee18, 18)}`)
  console.log(`  → ${symbol} debited    : ${formatUnits(usdcDelta, decimals)}`)
  console.log(`  → CELO debited        : ${formatUnits(nativeDelta, 18)}`)

  console.log(
    `\n✓ PROVEN: gas for ${CHAIN_ID} was paid in ${symbol} via adapter ${adapterAddr}, ` +
      `native CELO untouched. Our feeCurrency config is correct on a real node.`,
  )
}

main().catch((err: unknown) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
