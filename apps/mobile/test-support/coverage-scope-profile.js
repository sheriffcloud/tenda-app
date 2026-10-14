/**
 * Profile, build-identity and wallet-display modules included in mobile's
 * coverage allow-list. Kept as one cohesive register so coverage-scope.js
 * remains below the repository's 300-line limit.
 *
 * COMMONJS is required because Jest reads this before transforms are active.
 */
module.exports = [
  'theme/fonts.ts',
  'theme/tokens.ts',
  'components/shared/ReviewScore.tsx',
  'components/shared/PersonCard.tsx',
  'components/shared/ReviewCard.tsx',
  // Resolves the two live wire shapes: gig name columns and the exchange
  // identity label already scoped by the server (#175). Measured at
  // 100/100/100/100 when added; the global figures rose with it included.
  'components/shared/party-name.ts',
  'lib/env.ts',
  'lib/app-version.ts',
  'components/ui/AppVersion.tsx',
  'components/wallet/WalletBalanceRows.tsx',
  'components/wallet/{SigningWalletRow,sell/SellWalletNotice}.tsx',
  'hooks/wallet/useSigningWallet.ts',
  'stores/settings.store.ts',
]
