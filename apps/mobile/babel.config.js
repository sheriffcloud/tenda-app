module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
        // other plugins
        ['react-native-unistyles/plugin', {
            root: 'app'
        }],
        ['react-native-reanimated/plugin']
    ],
  }
}
