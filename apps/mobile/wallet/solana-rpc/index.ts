import { resolveSolanaPublicRpcEndpoints } from './endpoints'
import { createSolanaRpcTransport } from './transport'

export { classifySolanaRpcError, isRetryableSolanaRpcError } from './errors'
export { resolveSolanaPublicRpcEndpoints } from './endpoints'
export { createSolanaRpcTransport } from './transport'
export type { SolanaRpcErrorKind, SolanaRpcTransport } from './types'

export const solanaRpcTransport = createSolanaRpcTransport(resolveSolanaPublicRpcEndpoints())
