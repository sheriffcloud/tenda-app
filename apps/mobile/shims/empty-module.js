// Empty CommonJS stub used by metro.config.js to satisfy `require('crypto')`
// and other Node built-in imports inside the web3 stack (WalletConnect/Reown,
// @solana/web3.js) and their transitive deps. None of those Node-specific APIs
// are actually exercised on RN at runtime, the imports just need to resolve.
module.exports = {}
