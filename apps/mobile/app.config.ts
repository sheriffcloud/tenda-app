import { ExpoConfig, ConfigContext } from 'expo/config'
import { APP_INFO } from '@tenda/shared'

const apiHost = process.env.EXPO_PUBLIC_API_URL
  ? new URL(process.env.EXPO_PUBLIC_API_URL).host
  : ''

/**
 * Version fields are deliberately ABSENT from this file. `version`,
 * `android.versionCode` and `ios.buildNumber` live in app.json — the single
 * source of truth that `scripts/bump-version.mjs` writes and
 * `scripts/check-app-version.mjs` guards — and reach here through `...config`.
 *
 * The `...config.android` / `...config.ios` spreads below are load-bearing for
 * the same reason. @expo/config passes the STATIC config in as `config` and
 * then REPLACES it with whatever this function returns — `fillAndReturnConfig`
 * uses the dynamic result alone, it does not deep-merge. A bare
 * `android: { … }` therefore silently discards app.json's versionCode while
 * leaving the semver correct, so the app reports the right version and a
 * versionCode of 1 forever, and Play Store rejects the upload with no clue why.
 *
 * `scripts/check-app-version.mjs` is what catches that now; before it existed,
 * reading `npx expo config --type public` by eye was the only way.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_INFO.name,
  slug: 'tenda-app',
  // Sourced rather than typed, so the store blurb cannot drift from the one
  // the web app, the landing and the wallet modal all show. The Play Console
  // listing is edited outside this repo — this is the string to paste there.
  description: APP_INFO.description,
  scheme: ['tenda'],
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    // Carries app.json's `buildNumber` through — see the note above.
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: 'com.tendahq.mobile',
    // Stage 9C, Sign in with Apple entitlement (App Store 4.8: required
    // alongside Google sign-in). The expo-apple-authentication plugin adds it.
    usesAppleSignIn: true,
    icon: {
      light: './assets/images/icon.png',
      dark: './assets/images/ios-icon-dark.png',
      tinted: './assets/images/ios-icon-tinted.png',
    },
  },
  android: {
    // Carries app.json's `versionCode` through — see the note above.
    ...config.android,
    // 'resize' pairs with the app-wide KeyboardAvoidingView idiom
    // (behavior={undefined} on Android): the window resizes so bottom-anchored
    // inputs (ChatInput on the chat + dispute threads) fully clear the keyboard.
    // 'pan' only guaranteed the cursor cleared it, leaving the input row's lower
    // edge tucked under the keyboard.
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      // App light-surface color (badge ground); the foreground is glyph-only
      // ("t" + dot) so the OS mask (circle/squircle) produces the badge shape.
      // White, not the dark surface, since the icon family inverted to the
      // light logo — this colour IS the other half of the icon, so it has to
      // move with android-icon-foreground.png or the glyph vanishes into it.
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.tendahq.mobile',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    // Enabling this cause this app to exit from any screen
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: apiHost, pathPrefix: '/gig' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  extra: {
    // NO `?? 'development'` DEFAULT (#128). lib/env.ts is the only reader, and
    // its whole job is telling "nobody set this" apart from "somebody chose
    // development" — a production binary that silently talks to the dev API is
    // the failure it exists to catch. Defaulting here collapsed those two into
    // one value before the guard ever saw them, so the guard could only be
    // right by accident. Leave it undefined when unset and let env.ts decide.
    APP_ENV: process.env.APP_ENV,
    eas: {
      projectId: '9428bdad-8f0c-4a7d-b0cb-20e6a3fc63de'
    }
  },
  plugins: [
    './plugins/with-wallet-queries',
    'expo-router',
    // MUST stay BEFORE 'expo-notifications'. Config mods run in REVERSE
    // registration order — withMod's `interceptingMod` hands each action the
    // previously-registered mod as `nextMod` — so an entry listed LATER runs
    // EARLIER. This plugin asserts expo-notifications has already written
    // `notification_icon_color`, so it must be registered ahead of it in order
    // to run after it. Listed after, its guard fires on a clean prebuild.
    './plugins/with-notification-color-night',
    [
      'expo-notifications',
      {
        // Must be white-on-transparent: Android tints the small icon by alpha.
        icon: './assets/images/notification-icon.png',
        // The LIGHT-ground half of the tint only. This colour lands in
        // values/colors.xml as `notification_icon_color`, and it tints the
        // small icon in a notification shade whose theme is the SYSTEM's, not
        // ours — so ./plugins/with-notification-color-night adds the dark-ground
        // half (#5E87E8) in values-night. Both are `brand.primary` for their
        // ground; see that plugin for why one value cannot serve both.
        color: '#2E5BD6',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-splash-screen',
      {
        // Splash grounds match the app's real surface.background tokens so the
        // handoff from splash to first screen is seamless.
        backgroundColor: '#F7F5F0',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        dark: {
          backgroundColor: '#0D1018',
          image: './assets/images/splash-icon-dark.png',
        },
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'tenda-mobile',
        organization: 'xpl-developers'
      }
    ],
    'expo-video',
    [
    'expo-media-library',
      {
        photosPermission: 'Allow Tenda to access your gallery to save proof files.',
        savePhotosPermission: 'Allow Tenda to save proof files to your gallery.',
        isAccessMediaLocationEnabled: true,
      },
    ],
    'expo-secure-store',
    'expo-location',
    'expo-font',
    '@react-native-community/datetimepicker',
    // Stage 9C, Sign in with Apple (adds the iOS entitlement).
    'expo-apple-authentication',
    // Google sign-in's iOS build needs the reversed-client-id URL scheme. It's
    // only known once the Google OAuth client exists (USER ACTION), so the
    // plugin is added ONLY when GOOGLE_IOS_URL_SCHEME is set, keeps
    // `expo config` / the dev loop working before the credential is provisioned.
    ...(process.env.GOOGLE_IOS_URL_SCHEME
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
          ] as [string, { iosUrlScheme: string }],
        ]
      : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true
  }
})
