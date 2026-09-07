// Order matters. `react-native-get-random-values` installs the global
// `crypto.getRandomValues` shim that web3 libs (including WalletConnect) read on
// first import. `./shims/polyfills` then installs the global Buffer. Both must
// run before any code that could transitively touch crypto/Buffer, which
// `expo-router/entry` does as soon as it loads route modules.
import 'react-native-get-random-values'
import './shims/polyfills'
import 'expo-router/entry'
import './theme'
