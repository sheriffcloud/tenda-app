import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAIN_KINDS,
  CHAIN_MANIFEST,
  feeCurrencyAddress,
  isNativeAsset,
  assertManifestValid,
  type ChainManifestEntry,
} from '../../src/chains/manifest'
import {
  chainById,
  findChain,
  OBSERVED_GAS_PRICE_WEI,
  gigAssetByChain,
  exchangeAssetsByChain,
  evmPublicRpcUrl,
  requireEvmPublicRpcUrl,
  chainPublicFacts,
  evmChainNumericId,
  nativeAssetOf,
  nativeCurrencyOf,
  evmManifestEntries,
  firstEvmChainIdByKind,
} from '../../src/chains/manifest-queries'
import { ASSET_META, getAssetMeta } from '../../src/constants/assets'
import { isEvmChainId } from '../../src/utils/address'

// The manifest is a hand-maintained data table that the server registry,
// seeder, sponsor, and webhooks all key off — these invariants are what keep
// those consumers correct as chains are added. (The module also self-checks a
// subset at import; importing it here is itself coverage of that guard.)

test('manifest is non-empty and every id is unique', () => {
  assert.ok(CHAIN_MANIFEST.length > 0)
  const ids = CHAIN_MANIFEST.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate chain id in manifest')
})

test('every asset id resolves in ASSET_META', () => {
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      // The accessor, not a bracket read: `ASSET_META['constructor']` is a truthy
      // function, so the old `!== undefined` would have passed a prototype key.
      assert.ok(getAssetMeta(asset.id) !== null, `${asset.id} on ${entry.id} missing from ASSET_META`)
    }
  }
})

test('each chain has exactly one native asset (token null, no fromSecret)', () => {
  for (const entry of CHAIN_MANIFEST) {
    const natives = entry.assets.filter(isNativeAsset)
    assert.equal(natives.length, 1, `${entry.id} must have exactly one native asset, found ${natives.length}`)
  }
})

test('fromSecret assets are not counted native and have null manifest token', () => {
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (asset.fromSecret !== undefined) {
        assert.equal(asset.token, null, `${asset.id}: fromSecret asset must not also hardcode a token`)
        assert.equal(isNativeAsset(asset), false, `${asset.id}: secret-sourced asset is not native`)
      }
    }
  }
})

test('at most one gig asset per chain, and it IS the one gigAssetByChain answers with', () => {
  // The second half is what makes the first half matter. `gigAssetByChain`
  // returns the FIRST asset carrying the role and calls it "the" gig asset, so
  // a second one does not fail anywhere — it is silently ignored, or it wins
  // and changes the currency every gig on that chain is denominated in,
  // depending only on where someone typed it in the array. This is the RULE,
  // not a stopgap (#114, decided 2026-09-08): cNGN stays `roles: ['exchange']`
  // by design — its issuer can pause, blacklist or burn an escrowed balance,
  // and it exists on Celo alone — so no chain gets a second gig asset, and a
  // chosen-asset composer is not on the road map. The guard is what makes a
  // future entry that disagrees fail here instead of shipping.
  for (const entry of CHAIN_MANIFEST) {
    const gigs = entry.assets.filter((a) => a.roles.includes('gig'))
    assert.ok(gigs.length <= 1, `${entry.id} has ${gigs.length} gig assets`)
    assert.equal(gigAssetByChain(entry.id), gigs[0]?.id ?? null, `${entry.id} gig asset`)
  }
})

test('feeCurrency is set iff gasPolicy is feeCurrency, and resolves an address', () => {
  for (const entry of CHAIN_MANIFEST) {
    assert.equal(
      entry.feeCurrency !== undefined,
      entry.gasPolicy === 'feeCurrency',
      `${entry.id}: feeCurrency/gasPolicy mismatch`,
    )
    if (entry.feeCurrency !== undefined) {
      assert.ok(feeCurrencyAddress(entry) !== null, `${entry.id}: feeCurrency has no address`)
    } else {
      assert.equal(feeCurrencyAddress(entry), null)
    }
  }
})

test('EVM token addresses are 0x-prefixed 40-hex; native tokens are null', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    for (const asset of entry.assets) {
      if (asset.token === null) continue
      assert.match(asset.token, /^0x[0-9a-fA-F]{40}$/, `${asset.id} on ${entry.id} is not a valid EVM address`)
    }
  }
})

test('namespace, kind and gasPolicy are from the supported sets', () => {
  const policies = new Set(['native-seed', 'paymaster', 'feeCurrency', 'none'])
  for (const entry of CHAIN_MANIFEST) {
    assert.ok(entry.namespace === 'solana' || entry.namespace === 'eip155', `bad namespace on ${entry.id}`)
    assert.ok((CHAIN_KINDS as readonly string[]).includes(entry.kind), `bad kind on ${entry.id}`)
    assert.ok(policies.has(entry.gasPolicy), `bad gasPolicy on ${entry.id}`)
    assert.ok(entry.family.length > 0, `empty family on ${entry.id}`)
  }
})

test('chainById returns the entry for a known id and throws on unknown', () => {
  const entry = chainById('eip155:8453')
  assert.equal(entry.displayName, 'BASE')
  assert.throws(() => chainById('eip155:99999'), /unknown chain id/)
})

test('findChain returns undefined on unknown without throwing', () => {
  assert.equal(findChain('does:not-exist'), undefined)
  assert.ok(findChain('solana:devnet') !== undefined)
})

test('gigAssetByChain resolves a USDC stablecoin wherever a chain carries gigs, null when unknown', () => {
  // Not "every chain" by construction: a chain with no verified stablecoin
  // would ship exchange-only and gigAssetByChain would answer null for it —
  // the state the server's assertGigAsset 422s and the composers' pickers
  // filter out. No manifest chain is in that state today (the gig-less list
  // below is pinned EMPTY since 0G mainnet gained USDC.e on 2026-08-27). What
  // stays unconditional is the POLICY: where a gig asset exists, it is USDC.
  for (const entry of CHAIN_MANIFEST) {
    const gigAsset = gigAssetByChain(entry.id)
    if (gigAsset === null) continue
    const meta = getAssetMeta(gigAsset)
    assert.ok(meta !== null, `${entry.id} -> ${gigAsset} present in ASSET_META`)
    assert.equal(meta.is_stable, true, `${entry.id} gig asset must be a stablecoin`)
    assert.equal(meta.symbol, 'USDC', `${entry.id} gig asset must be USDC`)
  }
  assert.equal(gigAssetByChain('unknown:chain'), null)
})

/**
 * cNGN — the naira rail. Addresses READ FROM THE PUBLISHED SOURCE and then
 * confirmed against the live chains 2026-09-06: mainnet `symbol() == 'cNGN'`,
 * `decimals() == 6`, `paused() == false`, EIP-1967 implementation `Cngn3`;
 * testnet the same shape on chainId 0xaa044c. A wrong token address here is
 * not a broken build, it is money sent to the wrong contract, so it is pinned.
 */
test('cNGN is exchange-only on both Celo chains, at the addresses read from the live tokens', () => {
  const celo = CHAIN_MANIFEST.filter((c) => c.family === 'celo')
  assert.equal(celo.length, 2, 'expected exactly the two Celo chains')

  const byChain = new Map(celo.map((c) => [c.id, c.assets.find((a) => a.id === 'cNGN')]))
  for (const [id, asset] of byChain) {
    assert.ok(asset !== undefined, `${id} carries no cNGN`)
    assert.deepEqual(asset.roles, ['exchange'], `${id} cNGN roles`)
  }
  // That it declares NEITHER permit nor eip3009 — verified on-chain: no
  // DOMAIN_SEPARATOR, no nonces, no PERMIT_TYPEHASH, no EIP-3009 typehashes —
  // is already forced by the two general rules below ('permit config' allows a
  // permit only on an EVM GIG asset, and eip3009 requires a permit domain), so
  // it is not re-asserted here.

  assert.equal(byChain.get('eip155:42220')?.token, '0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f')
  assert.equal(byChain.get('eip155:11142220')?.token, '0xa188439ccCEe9A6aa0E842f9c17C1b00C7B4dd4D')
  // Mainnet and testnet are DIFFERENT contracts holding different money; one
  // id serving both is the Base/0G pattern, safe under one-active-chain-per-family.
  assert.notEqual(byChain.get('eip155:42220')?.token, byChain.get('eip155:11142220')?.token)
})

test('cNGN is a naira stable, so it is not priced through the dollar leg', () => {
  // The manifest half of the peg: an asset whose entry says NGN, reaching the
  // same registry every money surface converts through.
  assert.equal(ASSET_META.cNGN.peg, 'NGN')
  assert.equal(ASSET_META.cNGN.is_stable, true)
  assert.equal(ASSET_META.USDC_CELO.peg, 'USD')
})

test('gig coverage is pinned per chain — gig-less chains are named, never accidental', () => {
  // The loop above skips null, so THIS is what notices a chain silently losing
  // its gig asset: the gig-less list is pinned exactly (empty since
  // 2026-08-27, when 0G mainnet gained USDC.e — XSwap/CCIP Bridged USDC,
  // domain + EIP-3009 verified on-chain). A chain that must ship
  // exchange-only again gets NAMED here, never silently skipped.
  const gigless = CHAIN_MANIFEST.filter((c) => gigAssetByChain(c.id) === null).map((c) => c.id)
  assert.deepEqual(gigless, [])
  // Both 0G chains resolve the same registry id to DIFFERENT tokens (mock on
  // Galileo, USDC.e on mainnet) — the Base pattern, safe under
  // one-active-chain-per-family.
  assert.equal(gigAssetByChain('eip155:16602'), 'USDC_0G')
  assert.equal(gigAssetByChain('eip155:16661'), 'USDC_0G')
})

test('exchangeAssetsByChain returns USDC + the native token per chain; empty for unknown', () => {
  for (const entry of CHAIN_MANIFEST) {
    const ids = exchangeAssetsByChain(entry.id)
    assert.ok(ids.length >= 1, `${entry.id} should have at least one exchange asset`)
    // Every returned id is exchange-tagged in the manifest and resolves in ASSET_META.
    for (const id of ids) {
      const asset = entry.assets.find((a) => a.id === id)
      assert.ok(asset?.roles.includes('exchange'), `${id} on ${entry.id} must be exchange-tagged`)
      assert.ok(getAssetMeta(id) !== null, `${id} present in ASSET_META`)
    }
    // The chain's native token is always exchange-tradable.
    const native = entry.assets.find(isNativeAsset)
    assert.ok(native !== undefined && ids.includes(native.id), `${entry.id} native must be exchange-tradable`)
    // Where the chain carries a gig USDC, it is also exchange-tradable (roles
    // overlap); a gig-less chain — none today — would have nothing to overlap.
    const gigAsset = gigAssetByChain(entry.id)
    assert.ok(gigAsset === null || ids.includes(gigAsset), `${entry.id} USDC must be exchange-tradable`)
  }
  assert.deepEqual(exchangeAssetsByChain('unknown:chain'), [])
})

test('assertManifestValid rejects an EVM chain whose id carries no numeric reference', () => {
  // Readers PARSE this reference back out — the agent card (#105) emits it as
  // ERC-8004's numeric `chainId` in a document committed on-chain, where a NaN
  // serialises to `null`. Nothing type-checks a hand-edited id: the landing
  // consumes this module through a Vite source alias and other packages through
  // the CJS dist, exactly as the `status` guard's own comment describes.
  for (const id of ['eip155:', 'eip155:base', 'eip155:0', 'eip155:-1', 'eip155:1.5']) {
    const bad: ChainManifestEntry = {
      id, namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
      displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
      assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
    }
    assert.throws(() => assertManifestValid([bad]), /positive integer/, `'${id}' should be refused`)
  }
})

test('a HEX reference is refused — it would silently read as chain 1, mainnet', () => {
  // `Number('0x1')` is 1. A decimal-only test is the difference between
  // refusing a malformed id and quietly relabelling a chain as Ethereum
  // mainnet, so this is separated out rather than buried in the loop above.
  const bad: ChainManifestEntry = {
    id: 'eip155:0x1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /positive integer/)
})

test('isEvmChainId and evmChainNumericId agree — one predicate, no second copy', () => {
  // The parser delegates to the predicate. If they ever diverge, an id the
  // manifest validator accepts could still throw inside a caller that trusted
  // the guarantee — which is precisely the branch the agent card omits.
  for (const id of ['eip155:1', 'eip155:84532', 'eip155:16661']) {
    assert.equal(isEvmChainId(id), true, id)
    assert.equal(evmChainNumericId(id), Number(id.split(':')[1]))
  }
  for (const id of ['eip155:', 'eip155:0x1', 'eip155:abc', 'solana:devnet', 'eip155:0', 'nonsense']) {
    assert.equal(isEvmChainId(id), false, id)
    assert.throws(() => evmChainNumericId(id), /not a numeric eip155/, id)
  }
})

test('a NUMERIC reference under another namespace is still refused', () => {
  // The one input the namespace half of the predicate exists for, and the case
  // the list above cannot reach: every id there fails the DIGITS test too, so
  // deleting `namespace === 'eip155'` left them all still false and the mutant
  // survived (mutation M21). `solana:101` is well-formed CAIP-2 for a different
  // key space — returning 101 for it is how `evmChainNumericId`'s own docblock
  // says a caller silently builds a network with the wrong id.
  for (const id of ['solana:101', 'cosmos:42', 'bip122:0']) {
    assert.equal(isEvmChainId(id), false, `${id} is not an eip155 chain`)
    assert.throws(() => evmChainNumericId(id), /not a numeric eip155/, id)
  }
})

test('every live EVM entry in the REAL manifest parses to a numeric chain id', () => {
  // The guarantee the agent card relies on, asserted against the real data
  // rather than a fixture.
  for (const entry of CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155')) {
    const parsed = evmChainNumericId(entry.id)
    assert.ok(Number.isInteger(parsed) && parsed > 0, `${entry.id} must parse`)
  }
})

test('assertManifestValid rejects an asset that declares no roles', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: [], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /declares no roles/)
})

// ---------- assertManifestValid (the import-time integrity guard) -----------

test('assertManifestValid accepts the real manifest', () => {
  assert.doesNotThrow(() => assertManifestValid(CHAIN_MANIFEST))
})

test('assertManifestValid rejects a duplicate chain id', () => {
  const dup = [chainById('solana:devnet'), chainById('solana:devnet')]
  assert.throws(() => assertManifestValid(dup), /duplicate chain id/)
})

test('assertManifestValid rejects an asset missing from ASSET_META', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'NOT_A_REAL_ASSET', roles: ['gig'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /missing from ASSET_META/)
})

test('assertManifestValid rejects a chain without exactly one native asset', () => {
  const noNative: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }],
  }
  assert.throws(() => assertManifestValid([noNative]), /exactly one native asset/)
})

test('assertManifestValid rejects feeCurrency/gasPolicy mismatch', () => {
  const mismatch: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example',
    gasPolicy: 'none', feeCurrency: 'cUSD',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([mismatch]), /feeCurrency must be set iff/)
})

test('assertManifestValid rejects feeCurrency that resolves no address', () => {
  // gasPolicy feeCurrency + feeCurrency id present, but that asset has no token.
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example',
    gasPolicy: 'feeCurrency', feeCurrency: 'CELO',
    assets: [{ id: 'CELO', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /has no token address/)
})

test('every EVM manifest chain exposes a publicRpcUrl; assertManifestValid enforces it', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    assert.ok((entry.publicRpcUrl ?? '').length > 0, `${entry.id} missing publicRpcUrl`)
  }
  const noRpc: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([noRpc]), /must set a publicRpcUrl/)
})

test('every EVM manifest chain exposes an explorerUrl; assertManifestValid enforces it', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    assert.ok((entry.explorerUrl ?? '').length > 0, `${entry.id} missing explorerUrl`)
  }
  const noExplorer: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([noExplorer]), /must set an explorerUrl/)
})

// ---------- EIP-2612 permit config ------------------------------------------

test('permit config: USDC carries version 2 on every EVM chain; cUSD and natives carry none', () => {
  // Versions were read from the LIVE tokens (version() + DOMAIN_SEPARATOR
  // recomputation, 2026-07-03). cUSD's domain is non-standard → no entry.
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (entry.namespace === 'eip155' && asset.roles.includes('gig')) {
        assert.deepEqual(asset.permit, { version: '2' }, `${asset.id} on ${entry.id} should be permit v2`)
      } else {
        assert.equal(asset.permit, undefined, `${asset.id} on ${entry.id} must not declare permit`)
      }
    }
  }
})

test('assertManifestValid rejects permit on an asset without a canonical token', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [
      { id: 'ETH_BASE', roles: ['exchange'], token: null, permit: { version: '2' } },
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /declares permit but has no canonical token/)
})

test('assertManifestValid rejects an empty permit version', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', permit: { version: '' } },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /empty permit version/)
})

test('exactly one chain is active per family across mainnet/testnet pairs', () => {
  // Not a uniqueness assertion (families repeat by design) — documents that
  // families group networks, which the secret loader uses to enforce one
  // active chain per family.
  const byFamily = new Map<string, ChainManifestEntry[]>()
  for (const entry of CHAIN_MANIFEST) {
    const list = byFamily.get(entry.family) ?? []
    list.push(entry)
    byFamily.set(entry.family, list)
  }
  // base, solana, celo, and 0g each ship a mainnet/testnet pair.
  assert.deepEqual(byFamily.get('base')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('solana')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('celo')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('0g')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
})

// ---------- feeCurrency adapter resolution (USDC gas) ------------------------

test('feeCurrencyAddress returns the adapter for a USDC-gas chain, not the token', () => {
  // Celo's USDC is 6-decimal → the tx feeCurrency must be the FeeCurrencyDirectory
  // adapter (18-decimal gas interface), never the token itself.
  for (const id of ['eip155:42220', 'eip155:11142220']) {
    const entry = chainById(id)
    assert.equal(entry.feeCurrency, 'USDC_CELO')
    assert.ok(entry.feeCurrencyAdapter !== undefined, `${id} must carry a feeCurrencyAdapter`)
    assert.equal(feeCurrencyAddress(entry), entry.feeCurrencyAdapter, `${id} resolves to the adapter`)
    const usdc = entry.assets.find((a) => a.id === 'USDC_CELO')
    assert.notEqual(feeCurrencyAddress(entry), usdc?.token, `${id} must NOT resolve to the raw token`)
  }
})

test('feeCurrencyAddress falls back to the fee asset token when no adapter is set', () => {
  // An 18-decimal Mento stable is its own gas adapter — synthetic entry proves
  // the no-adapter branch still resolves the token address.
  const nativeStable: ChainManifestEntry = {
    id: 'eip155:42220', namespace: 'eip155', family: 'celo', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 3, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'cUSD',
    assets: [
      { id: 'cUSD', roles: ['exchange'], token: '0x765DE816845861e75A25fCA122bb6898B8B1282a' },
      { id: 'CELO', roles: ['exchange'], token: null },
    ],
  }
  assert.equal(feeCurrencyAddress(nativeStable), '0x765DE816845861e75A25fCA122bb6898B8B1282a')
})

test('assertManifestValid rejects a feeCurrencyAdapter set without a feeCurrency', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    feeCurrencyAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /feeCurrencyAdapter set without feeCurrency/)
})

test('assertManifestValid rejects a malformed feeCurrencyAdapter address', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'USDC_BASE',
    feeCurrencyAdapter: '0xnope',
    assets: [
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', permit: { version: '2' } },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /feeCurrencyAdapter is not a valid EVM address/)
})

test('assertManifestValid rejects a feeCurrency id that is not one of the chain assets', () => {
  // With an adapter present, a dangling feeCurrency id would otherwise resolve an
  // address and slip through — this guard catches the typo explicitly.
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'USDC_CELO',
    feeCurrencyAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /is not one of its assets/)
})

// ---------- gas-seed amount (native-seed onboarding grant) ------------------

test('both Solana chains carry a positive native-seed gasSeedAmountRaw', () => {
  for (const id of ['solana:mainnet', 'solana:devnet']) {
    const entry = CHAIN_MANIFEST.find((c) => c.id === id)
    assert.ok(entry !== undefined, `${id} present in the manifest`)
    assert.equal(entry.gasPolicy, 'native-seed', `${id} is a native-seed chain`)
    assert.match(entry.gasSeedAmountRaw ?? '', /^[1-9]\d*$/, `${id} declares base-unit seed`)
  }
})

const solanaSeedBase: ChainManifestEntry = {
  id: 'solana:x', namespace: 'solana', family: 'solana', kind: 'mainnet', status: 'planned',
  displayName: 'X', minConfirmations: 1, gasPolicy: 'native-seed',
  gasSeedAmountRaw: '7000000',
  assets: [{ id: 'SOL', roles: ['exchange'], token: null }],
}

test('every chain that declares a seed amount has an OBSERVED gas price behind it (#77)', () => {
  // The reverse guard lives in the anvil budget test (observed → declares a
  // seed). This is the direction that catches a guessed number: a chain may
  // not hand out native gas at an amount nobody measured a price for. 0G
  // mainnet was exactly that until 2026-09-08 — its amount was Galileo's,
  // carried across, with no mainnet reading on record.
  // EVM only: the table is in WEI from eth_gasPrice. Solana's seed is sized
  // from the protocol's fixed fee (SOLANA_TX_FEE_LAMPORTS), which is a
  // constant, not an observation, so those two chains are rightly absent.
  const seeded = CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155' && c.gasSeedAmountRaw !== undefined).map((c) => c.id)
  assert.ok(seeded.length > 0, 'no seed-bearing EVM chain — the guard would be vacuous')
  for (const id of seeded) {
    assert.ok(id in OBSERVED_GAS_PRICE_WEI, `${id} declares gasSeedAmountRaw but no observed gas price justifies it`)
    assert.ok(OBSERVED_GAS_PRICE_WEI[id] > 0n, `${id} observed price must be positive`)
  }
  assert.ok(seeded.includes('eip155:16661'), '0G mainnet is a seed-bearing chain and must stay covered')
})

test('assertManifestValid rejects gasSeedAmountRaw on a non-native-seed chain', () => {
  const bad: ChainManifestEntry = { ...solanaSeedBase, gasPolicy: 'none' }
  assert.throws(() => assertManifestValid([bad]), /gasSeedAmountRaw set without gasPolicy 'native-seed'/)
})

test('assertManifestValid rejects a non-positive-integer gasSeedAmountRaw', () => {
  // '0' is the sneaky one: a valid number, a useless seed. Fractional/garbage too.
  for (const amount of ['0', '1.5', '-1', 'abc', '']) {
    const bad: ChainManifestEntry = { ...solanaSeedBase, gasSeedAmountRaw: amount }
    assert.throws(() => assertManifestValid([bad]), /gasSeedAmountRaw must be a positive integer string/)
  }
})

// ---------- status: is Tenda's escrow actually deployed here? ---------------

/**
 * `status` exists because the landing inferred deployment from `kind` and
 * advertised four mainnet chains as live while none of them had a contract.
 * The field carries that claim explicitly; these tests hold it to being a
 * DECLARATION rather than a second derivation of `kind`.
 */

test('every manifest entry declares a status', () => {
  for (const entry of CHAIN_MANIFEST) {
    assert.ok(
      entry.status === 'live' || entry.status === 'launching' || entry.status === 'planned',
      `${entry.id} must declare a known status, saw ${String(entry.status)}`,
    )
  }
})

test('at most one chain is LAUNCHING — a launch claim names one chain, not a set', () => {
  // The distinction the third status exists for. Two chains "launching" at
  // once is how the copy went back to announcing a batch of launches: the
  // landing renders every launching chain under one verb.
  const launching = CHAIN_MANIFEST.filter((entry) => entry.status === 'launching')
  assert.ok(launching.length <= 1, `expected at most one launching chain, saw ${launching.length}`)
})

test('assertManifestValid rejects an entry whose status is missing', () => {
  // The shape a hand-edited entry has when someone adds a chain and forgets
  // the field. TS would catch it in this repo; the landing reads this module
  // through a Vite source alias and the apps through the CJS dist, and neither
  // boundary re-checks the type — so the guard is what actually holds.
  const { status: _dropped, ...withoutStatus } = solanaSeedBase
  const bad = withoutStatus as ChainManifestEntry
  assert.throws(
    () => assertManifestValid([bad]),
    /must declare status 'live', 'launching' or 'planned'/,
  )
})

test('assertManifestValid rejects a status outside the vocabulary', () => {
  // 'deployed', 'coming-soon', 'true' — the plausible near-misses. Each must
  // be refused rather than silently treated as not-live, which is how a
  // deployed chain would vanish from every surface that filters on status.
  for (const status of ['deployed', 'coming-soon', 'LIVE', 'Launching', '']) {
    // A single narrowing cast (string -> the union), not `unknown`: the point
    // is to hand the guard a value the type system would have refused, which
    // is exactly what an untyped boundary hands it in production.
    const bad: ChainManifestEntry = { ...solanaSeedBase, status } as ChainManifestEntry
    assert.throws(
      () => assertManifestValid([bad]),
      /must declare status 'live', 'launching' or 'planned'/,
      `status '${status}' must be refused`,
    )
  }
})

test('every status in the vocabulary is accepted — the guard refuses nothing valid', () => {
  for (const status of ['live', 'launching', 'planned'] as const) {
    assert.doesNotThrow(() => assertManifestValid([{ ...solanaSeedBase, status }]))
  }
})

// ---------- AppKit-network derivation primitives (Stage 1) -------------------
// These let the mobile network list derive from the manifest with no per-chain
// literals, so adding an EVM chain is a manifest entry + secrets, no app edit.

test('evmChainNumericId parses the CAIP-2 reference; rejects non-EVM / malformed', () => {
  assert.equal(evmChainNumericId('eip155:8453'), 8453)
  assert.equal(evmChainNumericId('eip155:84532'), 84532)
  assert.throws(() => evmChainNumericId('solana:devnet'), /not a numeric eip155/)
  assert.throws(() => evmChainNumericId('eip155:'), /not a numeric eip155/)
  assert.throws(() => evmChainNumericId('eip155:0x1'), /not a numeric eip155/)
})

test('nativeAssetOf returns the sole native asset for every chain', () => {
  for (const entry of CHAIN_MANIFEST) {
    const native = nativeAssetOf(entry)
    assert.equal(native.token, null, `${entry.id} native must have no token`)
    assert.equal(native.fromSecret, undefined, `${entry.id} native must have no secret`)
    assert.ok(native.roles.includes('exchange'), `${entry.id} native should be exchange-tradable`)
  }
})

test('nativeCurrencyOf assembles name/symbol/decimals from the native asset', () => {
  const base = nativeCurrencyOf(chainById('eip155:8453'))
  assert.deepEqual(base, { name: 'Ether', symbol: 'ETH', decimals: 18 })
  const celo = nativeCurrencyOf(chainById('eip155:42220'))
  assert.deepEqual(celo, { name: 'Celo', symbol: 'CELO', decimals: 18 })
})

test('nativeCurrencyOf falls back to symbol when the asset omits a name', () => {
  // USDC_SOL has no `name`; a hypothetical native USDC chain would surface the
  // symbol. Proven directly on the fallback branch via a synthetic entry.
  const synthetic: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    assets: [{ id: 'USDC_SOL', roles: ['exchange'], token: null }],
  }
  assert.deepEqual(nativeCurrencyOf(synthetic), { name: 'USDC', symbol: 'USDC', decimals: 6 })
})

test('nativeCurrencyOf refuses a native asset ASSET_META does not know', () => {
  // The manifest's own load-time check makes this unreachable through
  // CHAIN_MANIFEST, but `nativeCurrencyOf` takes an ENTRY, so a caller can
  // reach it — and it must fail loudly rather than build a currency out of
  // undefined. The bare `ASSET_META[id]` this replaced could not: an id that is
  // an Object.prototype key ('toString') answered a truthy FUNCTION, and the
  // result was { name: undefined, symbol: undefined, decimals: undefined }.
  const unknown: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    assets: [{ id: 'NOT_IN_ASSET_META', roles: ['exchange'], token: null }],
  }
  assert.throws(() => nativeCurrencyOf(unknown), /missing from ASSET_META/)

  // And the prototype-key form specifically — the one that used to slip past.
  const inherited: ChainManifestEntry = {
    ...unknown,
    assets: [{ id: 'toString', roles: ['exchange'], token: null }],
  }
  assert.throws(() => nativeCurrencyOf(inherited), /missing from ASSET_META/)
})

test('evmManifestEntries returns only EVM chains, in manifest order', () => {
  const evm = evmManifestEntries()
  assert.ok(evm.length > 0)
  assert.ok(evm.every((e) => e.namespace === 'eip155'), 'only eip155 entries')
  assert.deepEqual(
    evm.map((e) => e.id),
    CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155').map((c) => c.id),
  )
})

test('firstEvmChainIdByKind picks the first ENABLED EVM chain per env kind', () => {
  // Namespace-only for auth, but the value must stay stable: manifest order
  // defines the canonical pick, and a PAUSED chain is skipped — Base is paused
  // (2026-10-02), so dev -> Celo Sepolia and prod -> Celo. Re-enabling Base
  // restores eip155:84532 / eip155:8453 here by deleting its one `paused` line.
  assert.equal(firstEvmChainIdByKind('testnet'), 'eip155:11142220')
  assert.equal(firstEvmChainIdByKind('mainnet'), 'eip155:42220')
})

// --- public RPC URL (client-side balance reads) ----------------------------

/**
 * The single source for client-side RPC endpoints — the comment on
 * `evmPublicRpcUrl` says callers must not hardcode them. The pair exists
 * because the two call sites want opposite failure modes: a screen that renders
 * with no balances, or a caller that cannot proceed without the URL.
 */
test('evmPublicRpcUrl returns the manifest URL for every EVM chain', () => {
  const evm = CHAIN_MANIFEST.filter((c) => c.id.startsWith('eip155:'))
  assert.ok(evm.length > 0, 'expected EVM chains in the manifest')
  for (const chain of evm) {
    assert.equal(evmPublicRpcUrl(chain.id), chain.publicRpcUrl ?? null, chain.id)
    // Not a hardcoded literal: it must track the manifest entry itself.
    assert.match(String(evmPublicRpcUrl(chain.id)), /^https:\/\//, chain.id)
  }
})

test('evmPublicRpcUrl is non-throwing for unknown and non-EVM chains', () => {
  // A registry chain with no manifest match yields no reads rather than
  // crashing the screen.
  assert.equal(evmPublicRpcUrl('eip155:999999'), null)
  assert.equal(evmPublicRpcUrl('not-a-chain'), null)
  const solana = CHAIN_MANIFEST.find((c) => c.id.startsWith('solana:'))
  assert.ok(solana)
  assert.equal(evmPublicRpcUrl(solana.id), null, 'non-EVM chains have no public RPC URL')
})

test('requireEvmPublicRpcUrl returns the same URL for a known chain', () => {
  const evm = CHAIN_MANIFEST.find((c) => c.id.startsWith('eip155:'))
  assert.ok(evm)
  assert.equal(requireEvmPublicRpcUrl(evm.id), evmPublicRpcUrl(evm.id))
})

test('requireEvmPublicRpcUrl throws — it is the variant for callers that cannot proceed', () => {
  assert.throws(() => requireEvmPublicRpcUrl('eip155:999999'), /no publicRpcUrl for EVM chain/)
  assert.throws(() => requireEvmPublicRpcUrl('not-a-chain'), /not in CHAIN_MANIFEST/)
})

// --- nativeAssetOf: the manifest invariant it enforces ---------------------

test('nativeAssetOf returns the native asset of every manifest chain', () => {
  for (const chain of CHAIN_MANIFEST) {
    assert.equal(isNativeAsset(nativeAssetOf(chain)), true, chain.id)
  }
})

test('nativeAssetOf throws rather than returning undefined — an absent native asset is a manifest bug', () => {
  const broken: ChainManifestEntry = {
    ...CHAIN_MANIFEST[0],
    assets: CHAIN_MANIFEST[0].assets.filter((a) => !isNativeAsset(a)),
  }
  assert.throws(() => nativeAssetOf(broken), /violates the manifest invariant/)
})

test('eip3009 (#18): every declaration rides a permit domain, and a declaration without one is refused', () => {
  const declared = CHAIN_MANIFEST.flatMap((c) => c.assets.filter((a) => a.eip3009 !== undefined).map((a) => `${c.id}/${a.id}`))
  assert.ok(declared.length > 0, 'expected at least one eip3009-capable asset')
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (asset.eip3009 !== undefined) assert.ok(asset.permit !== undefined, `${entry.id}/${asset.id}`)
    }
  }
  const [base] = CHAIN_MANIFEST.filter((c) => c.id === 'eip155:8453')
  assert.ok(base)
  const broken: ChainManifestEntry = {
    ...base,
    assets: base.assets.map((a) => (a.id === 'USDC_BASE' ? { id: a.id, roles: a.roles, token: a.token, eip3009: true } : a)),
  }
  assert.throws(() => assertManifestValid([broken]), /declares eip3009 but no permit domain/)
})

// ---------- faucetUrl (#137): a testnet fact, refused everywhere else --------

test('assertManifestValid refuses a faucetUrl on a mainnet — a faucet there is a claim that cannot be true', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', explorerUrl: 'https://scan.example',
    gasPolicy: 'none', faucetUrl: 'https://faucet.example',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /cannot declare a faucetUrl/)
})

test('assertManifestValid refuses a faucetUrl that is not https', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:11155111', namespace: 'eip155', family: 'eth', kind: 'testnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', explorerUrl: 'https://scan.example',
    gasPolicy: 'none', faucetUrl: 'http://faucet.example',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /must be an https URL/)
})

test('the testnets Circle serves carry its faucet; 0G Galileo, whose USDC is the repo mock, carries none', () => {
  // VERIFIED 2026-09-07 against faucet.circle.com's network list. A testnet
  // gaining a faucet, or losing one, is a manifest edit and shows up here.
  const faucets = Object.fromEntries(
    CHAIN_MANIFEST.filter((c) => c.kind === 'testnet').map((c) => [c.id, c.faucetUrl ?? null]),
  )
  assert.deepEqual(faucets, {
    'solana:devnet': 'https://faucet.circle.com',
    'eip155:84532': 'https://faucet.circle.com',
    'eip155:11142220': 'https://faucet.circle.com',
    'eip155:16602': null,
    // VERIFIED 2026-10-05: faucet.circle.com lists "Arc Testnet".
    'eip155:5042002': 'https://faucet.circle.com',
  })
  for (const c of CHAIN_MANIFEST.filter((c) => c.kind === 'mainnet')) {
    assert.equal(c.faucetUrl, undefined, `${c.id} is a mainnet and declares a faucet`)
  }
})

// ---------- chainPublicFacts (#132 / #137): the registry's per-chain facts ---

test('chainPublicFacts spells the manifest facts in wire form for an EVM testnet, all three present', () => {
  // Pinned literally rather than read back off the manifest: a helper that
  // returned the wrong FIELD (say publicRpcUrl under explorer_url) would still
  // agree with itself, and the literal is what catches that.
  assert.deepEqual(chainPublicFacts('eip155:84532'), {
    rpc_url: 'https://sepolia.base.org',
    explorer_url: 'https://sepolia.basescan.org',
    faucet_url: 'https://faucet.circle.com',
  })
})

test('chainPublicFacts: a Solana cluster has no RPC or explorer entry but may have a faucet; a mainnet has no faucet', () => {
  assert.deepEqual(chainPublicFacts('solana:devnet'), {
    rpc_url: null,
    explorer_url: null,
    faucet_url: 'https://faucet.circle.com',
  })
  const mainnet = chainPublicFacts('eip155:42220')
  assert.equal(mainnet.faucet_url, null)
  assert.match(String(mainnet.rpc_url), /^https:\/\//)
  assert.match(String(mainnet.explorer_url), /^https:\/\//)
})

test('chainPublicFacts answers all-null for an id the manifest does not know, without throwing', () => {
  assert.deepEqual(chainPublicFacts('eip155:999999'), { rpc_url: null, explorer_url: null, faucet_url: null })
  assert.deepEqual(chainPublicFacts('not-a-chain'), { rpc_url: null, explorer_url: null, faucet_url: null })
})

test('chainPublicFacts agrees with evmPublicRpcUrl on every manifest chain — one source for the RPC', () => {
  for (const chain of CHAIN_MANIFEST) {
    assert.equal(chainPublicFacts(chain.id).rpc_url, evmPublicRpcUrl(chain.id), chain.id)
  }
})

// ---------- openMint (#139): a testnet gig asset has a faucet OR an open mint --

const testnetBase: ChainManifestEntry = {
  id: 'eip155:11155111', namespace: 'eip155', family: 'eth', kind: 'testnet', status: 'planned',
  displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', explorerUrl: 'https://scan.example',
  gasPolicy: 'none',
  assets: [
    { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', permit: { version: '2' } },
    { id: 'ETH_BASE', roles: ['exchange'], token: null },
  ],
}

test('assertManifestValid refuses a testnet gig asset with neither a faucetUrl nor openMint', () => {
  assert.throws(() => assertManifestValid([testnetBase]), /neither a faucetUrl nor openMint/)
})

test('assertManifestValid accepts the testnet gig asset with either answer', () => {
  assert.doesNotThrow(() => assertManifestValid([{ ...testnetBase, faucetUrl: 'https://faucet.example' }]))
  const [gig, native] = testnetBase.assets
  assert.doesNotThrow(() => assertManifestValid([{ ...testnetBase, assets: [{ ...gig, openMint: true }, native] }]))
})

test('assertManifestValid refuses openMint on a mainnet and on a native asset', () => {
  const [gig, native] = testnetBase.assets
  const mainnet: ChainManifestEntry = { ...testnetBase, id: 'eip155:1', kind: 'mainnet', assets: [{ ...gig, openMint: true }, native] }
  assert.throws(() => assertManifestValid([mainnet]), /openMint — testnet ERC-20 mocks only/)
  const nativeMock: ChainManifestEntry = { ...testnetBase, faucetUrl: 'https://faucet.example', assets: [gig, { ...native, openMint: true }] }
  assert.throws(() => assertManifestValid([nativeMock]), /openMint — testnet ERC-20 mocks only/)
})

test('0G Galileo is the one open-mint testnet, and every other testnet gig asset has a faucet', () => {
  for (const entry of CHAIN_MANIFEST.filter((c) => c.kind === 'testnet')) {
    const gig = entry.assets.find((a) => a.roles.includes('gig'))
    assert.ok(gig, `${entry.id} has a gig asset`)
    assert.equal(gig.openMint === true, entry.id === 'eip155:16602', `${entry.id} openMint`)
    assert.equal(entry.faucetUrl !== undefined, entry.id !== 'eip155:16602', `${entry.id} faucetUrl`)
  }
})

// --- Arc ------------------------------------------------------------------------

test('ARC: two planned entries, chain ids as VERIFIED on-chain, USDC as both gas and payment asset', () => {
  const arc = CHAIN_MANIFEST.filter((c) => c.family === 'arc')
  assert.deepEqual(arc.map((c) => c.id), ['eip155:5042', 'eip155:5042002'])
  const [mainnet, testnet] = arc
  assert.equal(mainnet.kind, 'mainnet')
  assert.equal(testnet.kind, 'testnet')
  // 'planned' until a broadcast transaction with a receipt exists (the ChainStatus rule).
  for (const c of arc) {
    assert.equal(c.status, 'planned', `${c.id}: nothing is deployed`)
    assert.equal(c.namespace, 'eip155')
    // The native token IS USDC, so the existing "user pays gas in the native token" policy already fits.
    assert.equal(c.gasPolicy, 'none')
    assert.equal(c.feeCurrency, undefined)
  }
  assert.equal(mainnet.publicRpcUrl, 'https://rpc.mainnet.arc.io')
  assert.equal(testnet.publicRpcUrl, 'https://rpc.testnet.arc.io')
  assert.equal(evmChainNumericId('eip155:5042'), 5042)
  assert.equal(evmChainNumericId('eip155:5042002'), 5042002)
})

test('ARC: the ERC-20 USDC is the gig asset (6 decimals, EIP-3009 under name USDC / version 2); the native USDC (18) is gas and exchange-only', () => {
  for (const id of ['eip155:5042', 'eip155:5042002']) {
    const chain = chainById(id)
    assert.equal(gigAssetByChain(id), 'USDC_ARC')
    const erc20 = chain.assets.find((a) => a.id === 'USDC_ARC')
    assert.equal(erc20?.token, '0x3600000000000000000000000000000000000000')
    assert.deepEqual(erc20?.permit, { version: '2' })
    assert.equal(erc20?.eip3009, true)
    assert.equal(getAssetMeta('USDC_ARC')?.decimals, 6)
    // The native asset is the chain's ONE native (token null) and carries 18 decimals.
    assert.equal(nativeAssetOf(chain).id, 'USDC_ARC_NATIVE')
    assert.equal(getAssetMeta('USDC_ARC_NATIVE')?.decimals, 18)
    assert.deepEqual(nativeAssetOf(chain).roles, ['exchange'], 'never a gig asset')
    // And the native currency a wallet is told to add the chain with is USDC at 18.
    assert.deepEqual(nativeCurrencyOf(chain), { name: 'USDC', symbol: 'USDC', decimals: 18 })
  }
})

test('ARC: finality is unmeasured, so the mainnet waits for 2 confirmations and the testnet for 1', () => {
  // NOT MEASURED (see the manifest entry): the conservative number is a decision, and a quiet
  // change to it would change when an Arc escrow is treated as final.
  assert.equal(chainById('eip155:5042').minConfirmations, 2)
  assert.equal(chainById('eip155:5042002').minConfirmations, 1)
})

test('ARC: the testnet carries Circle\'s faucet; the mainnet carries none', () => {
  assert.equal(chainById('eip155:5042002').faucetUrl, 'https://faucet.circle.com')
  assert.equal(chainById('eip155:5042').faucetUrl, undefined)
})
