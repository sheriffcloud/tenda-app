/**
 * Expo config plugin: declares wallet-app deeplink schemes in Android's
 * `<queries>` block (Android 11+) and iOS's `LSApplicationQueriesSchemes`
 * (iOS 9+). Without these, `Linking.openURL('metamask://...')` silently
 * fails on Android and returns `false` from `canOpenURL` on iOS.
 *
 * Each wallet SDK / universal-link integration uses the wallet's native
 * scheme, declared here so the OS lets us discover and open them.
 *
 * Survives `expo prebuild --clean` because it re-runs during prebuild.
 */
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins')

/** Schemes for wallets we route through SDK/universal-link adapters. */
const WALLET_SCHEMES = ['metamask', 'phantom', 'solflare']

function makeIntent(scheme) {
  return {
    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
    data: [{ $: { 'android:scheme': scheme } }],
  }
}

function withAndroidWalletQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest
    if (!manifest.queries) manifest.queries = [{ intent: [] }]
    if (!manifest.queries[0]) manifest.queries[0] = { intent: [] }
    if (!manifest.queries[0].intent) manifest.queries[0].intent = []

    const intents = manifest.queries[0].intent
    const existingSchemes = new Set(
      intents.flatMap((intent) =>
        (intent.data ?? []).map((d) => d?.$?.['android:scheme']).filter(Boolean),
      ),
    )

    for (const scheme of WALLET_SCHEMES) {
      if (existingSchemes.has(scheme)) continue
      intents.push(makeIntent(scheme))
    }
    return mod
  })
}

function withIosWalletQueries(config) {
  return withInfoPlist(config, (mod) => {
    const existing = mod.modResults.LSApplicationQueriesSchemes ?? []
    mod.modResults.LSApplicationQueriesSchemes = Array.from(
      new Set([...existing, ...WALLET_SCHEMES]),
    )
    return mod
  })
}

module.exports = function withWalletQueries(config) {
  config = withAndroidWalletQueries(config)
  config = withIosWalletQueries(config)
  return config
}
