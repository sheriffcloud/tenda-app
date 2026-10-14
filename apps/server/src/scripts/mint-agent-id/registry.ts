/**
 * The ERC-8004 Identity Registry, as it actually is on Celo — MEASURED, not
 * copied from the docs (2026-09-05, against forno.celo.org).
 *
 * The published example is `@chaoschain/sdk` + web3.js event syntax and does
 * not say what the contract's own interface is, so the interface below was
 * probed directly. A missing selector reverts with EMPTY data; a present one
 * reverts with a decodable error. `registerAgent(string)` returned `0x`;
 * `register(string)` returned `0x64a0ae92…`, which is
 * `ERC721InvalidReceiver(address)` for the zero address — `eth_call` defaults
 * its sender to `0x0`, and the function mints to `msg.sender`. Calling it again
 * `--from` a real address returned a uint256. So:
 *
 *   - `register(string)` EXISTS, mints to msg.sender, returns the token id;
 *   - the contract is a real ERC-721 (`supportsInterface(0x80ac58cd)` = true,
 *     `name()` = "AgentIdentity", `symbol()` = "AGENT").
 *
 * `totalSupply()` reverts, so this is not an enumerable ERC-721 — do not add a
 * pre-flight that calls it.
 */

/** Only what this script calls. A narrow ABI cannot drift into unused surface. */
export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    // The double-mint guard: one wallet should hold exactly one Agent ID.
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

/**
 * Registry address per manifest chain id.
 *
 * NOT in CHAIN_MANIFEST on purpose. #81 is where registry addresses become
 * optional manifest fields behind a capability-shaped port; putting them there
 * now would ship half of that seam to serve one script, and the manifest is
 * loaded by every client at boot. When #81 lands, this map is what moves.
 *
 * Celo mainnet is MEASURED. Celo Sepolia is the documented address and is
 * unverified here — which is why `assertIsRegistry` below checks `name()` on
 * whichever chain is selected rather than trusting this table.
 */
export const IDENTITY_REGISTRY: Readonly<Record<string, `0x${string}`>> = {
  'eip155:42220': '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  'eip155:11142220': '0x8004A818BFB912233c491871b3d84c89A494BD9e',
}

/** What a correct registry answers to `name()`. */
export const REGISTRY_NAME = 'AgentIdentity'

/** Where a minted id can be seen. */
export function scanUrl(chain_id: string, agentId: bigint): string {
  const network = chain_id === 'eip155:42220' ? 'celo' : 'celo-sepolia'
  return `https://www.8004scan.io/agents/${network}/${agentId}`
}
