/**
 * Platform fee in raw base units, BigInt-exact. Safe for 18-decimal assets
 * where the fee exceeds Number.MAX_SAFE_INTEGER (display/settlement math must
 * stay lossless). The floor division matches the on-chain contract.
 */
export function computePlatformFeeRaw(paymentLamports: bigint, feeBps: number): bigint {
  return (paymentLamports * BigInt(feeBps)) / 10_000n
}

/**
 * Compute the platform fee for a given payment amount using BigInt arithmetic
 * to avoid overflow and TypeError from bigint × number operations. Returns a
 * Number for legacy callers at USDC/SOL scale; prefer computePlatformFeeRaw
 * for exact base-unit math.
 */
export function computePlatformFee(paymentLamports: bigint, feeBps: number): number {
  return Number(computePlatformFeeRaw(paymentLamports, feeBps))
}
