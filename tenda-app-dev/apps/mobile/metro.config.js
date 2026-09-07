const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// Watching the whole workspace (above) now also drags in contracts/, ~1.3k
// directories of vendored Foundry libraries (openzeppelin, forge-std) that the
// app never bundles. Crawling them exhausts Linux's inotify watch limit and
// Metro dies with ENOSPC. Nothing in mobile resolves through contracts/ — the
// ABIs the apps consume live in packages/shared/src/abi — so it is excluded
// from the file map entirely.
//
// Anchored to the workspace-root directory on purpose: a loose /contracts/
// pattern would also swallow packages/shared/src/api/contracts, which IS used.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contractsRoot = new RegExp(
  `^${escapeRe(path.resolve(workspaceRoot, "contracts"))}[\\\\/].*`,
);
// Test fixtures are not app code, and `app/` is a require.context root.
//
// expo-router bundles `app/` via `require.context(APP_ROOT, true, /\.[tj]sx?$/)`,
// which sweeps in EVERY matching file under it, route or not. Expo's default
// blockList already carries `/(\/__tests__\/.*)$/`, which is the only reason
// the ~20 colocated suites under `app/**/__tests__` have never reached the
// bundle. `__fixtures__` had no such entry, so `app/settings/__fixtures__/`
// did reach it and dragged @testing-library/react-native — and its
// `require("console")` — into the Android graph, failing the bundle outright.
//
// `__fixtures__` rather than `__tests__` is deliberate at the call sites, not
// an accident to undo: jest-expo's testMatch treats every file under
// `__tests__` as a suite, so a shared harness cannot live there. So the
// directory gets the same bundler treatment its sibling already has.
//
// Same shape as Expo's own entry (unanchored, so it matches at any depth).
// Safe repo-wide: nothing outside a test imports from a `__fixtures__` dir.
const testFixtures = /(\/__fixtures__\/.*)$/;

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  contractsRoot,
  testFixtures,
];

// Node-builtin shims for the web3 stack (WalletConnect/Reown relay +
// @solana/web3.js), which reference Node built-ins that don't exist on RN. We
// map most to an empty stub (the code paths aren't actually reached) and
// `stream` to its userland reimplementation. If a real runtime call ever hits
// one of these stubs we'll see a clear error and can swap in the proper shim then.
const emptyModule = path.resolve(projectRoot, "shims/empty-module.js");
const nodeBuiltins = {
  assert: emptyModule,
  crypto: emptyModule,
  dns: emptyModule,
  fs: emptyModule,
  http: emptyModule,
  https: emptyModule,
  net: emptyModule,
  os: emptyModule,
  path: emptyModule,
  stream: require.resolve("readable-stream"),
  tls: emptyModule,
  url: emptyModule,
  zlib: emptyModule,
};

config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  ...nodeBuiltins,
};

// Redirect the Node-only `whatwg-url`/`webidl-conversions` to the RN-safe
// versions Expo already ships and runs on Hermes (whatwg-url-without-unicode +
// webidl-conversions@5).
//
// Why: the admin app's test tooling (vitest + jsdom@28) drags whatwg-url@16 ->
// webidl-conversions@8 into the workspace-root node_modules. Because mobile's
// resolver is flat (disableHierarchicalLookup + nodeModulesPaths above), Metro
// resolves EVERY `require('whatwg-url')` to that hoisted v16, even though
// mobile's real importers (node-fetch via @solana/web3.js) declare
// whatwg-url@5. v16/webidl-conversions@8 use ES2024 APIs Hermes lacks
// (SharedArrayBuffer, resizable buffers, String.prototype.toWellFormed) and
// crash at bundle evaluation. Pinning to the Hermes-proven pair fixes the
// mis-resolution at its seam instead of polyfilling each missing feature.
const safeUrlRedirects = {
  "whatwg-url": require.resolve("whatwg-url-without-unicode"),
  "webidl-conversions": require.resolve("webidl-conversions", {
    paths: [path.dirname(require.resolve("whatwg-url-without-unicode/package.json"))],
  }),
};
// MWA codec version pinning. The Solana Mobile Wallet Adapter protocol is built
// against @solana/codecs-*@^4.0.0 (it uses codecs-strings to encode the local
// association's wire messages) and ships those 4.0.0 copies NESTED. But
// @solana/web3.js drags @solana/codecs-*@2.0.0-rc.1 to the top level, and the
// flat resolver above (disableHierarchicalLookup, load-bearing for single-React)
// would otherwise force MWA onto that 2.0.0-rc.1, a major-version skew that
// corrupts the encoded association bytes and nulls the native MessageSender, so
// connect/sign fails intermittently on every Solana wallet. We can't dedupe (the
// two consumers genuinely need different majors), so we redirect ONLY the MWA
// subtree's codec imports to its own nested 4.0.0 native build; web3.js keeps
// 2.0.0-rc.1 everywhere else. The predicate also catches the 4.0.0 codecs'
// internal cross-imports (their paths sit under the MWA subtree), so the whole
// graph resolves to 4.0.0 consistently.
const mwaProtoDir = path.resolve(
  workspaceRoot,
  "node_modules/@solana-mobile/mobile-wallet-adapter-protocol",
);
const mwaCodecTargets = Object.fromEntries(
  [
    "@solana/codecs-strings",
    "@solana/codecs-numbers",
    "@solana/codecs-core",
    "@solana/errors",
  ].map((name) => {
    const dir = path.join(mwaProtoDir, "node_modules", name);
    const pkg = require(path.join(dir, "package.json"));
    const entry = pkg["react-native"] || pkg.module || pkg.main;
    return [name, path.resolve(dir, entry)];
  }),
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const redirected = safeUrlRedirects[moduleName];
  if (redirected) {
    return { type: "sourceFile", filePath: redirected };
  }
  const mwaCodec = mwaCodecTargets[moduleName];
  if (
    mwaCodec &&
    context.originModulePath &&
    context.originModulePath.includes("mobile-wallet-adapter-protocol")
  ) {
    return { type: "sourceFile", filePath: mwaCodec };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
