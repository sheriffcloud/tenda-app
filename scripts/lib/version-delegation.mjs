/**
 * Two config files that must never take OWNERSHIP of the version.
 *
 * version.mjs compares the three files that carry the version. These checks
 * cover the adjacent failure: all three agreeing perfectly while the build
 * ignores them. Both are invisible to a diff review, a type-check and every
 * render test, which is exactly why they are machine-checked rather than
 * written down in a comment somewhere.
 *
 *   - apps/mobile/app.config.ts must keep DELEGATING to app.json.
 *   - apps/mobile/eas.json must keep DEFERRING versioning to this repo.
 */

/**
 * Drop comment-only lines, and trailing `//` comments that are not part of a
 * URL. Enough to keep the checks below from matching prose — app.config.ts's
 * own header talks about `version:` at length — without pretending to parse
 * TypeScript.
 */
function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

/**
 * Assert app.config.ts still DELEGATES the version to app.json.
 *
 * @expo/config hands the static config to the dynamic one and then replaces it
 * with whatever that returns — it does not deep-merge. So two edits silently
 * detach the build from the source of truth:
 *
 *   - re-adding a `version:` key here, which overrides app.json outright;
 *   - dropping `...config.android` / `...config.ios`, which discards
 *     versionCode / buildNumber while leaving the semver correct.
 *
 * The second is the nasty one: the app reports the right version and a
 * versionCode of 1 forever, and Play Store rejects the upload with no clue why.
 *
 * All three version keys are rejected, not just `version:`. Hardcoding
 * `versionCode:` inside the android block overrides app.json exactly as much as
 * a top-level `version:` does, and is the more tempting mistake because the
 * spread sits right above it.
 *
 * Each pattern requires the KEY: a word boundary, the name, then a colon. A
 * plugin path like `'./plugins/with-version-guard'` contains `version` and must
 * not trip; `runtimeVersion:` has no boundary before `version` and must not
 * either.
 *
 * @param {string} text apps/mobile/app.config.ts
 */
export function assertConfigDelegatesVersion(text) {
  const code = stripComments(text)

  for (const key of ['version', 'versionCode', 'buildNumber']) {
    if (new RegExp(`\\b${key}\\s*:`).test(code)) {
      throw new Error(
        `app.config.ts declares a \`${key}:\` key — it must come from app.json ` +
          '(a literal here silently overrides the source of truth)',
      )
    }
  }
  for (const platform of ['android', 'ios']) {
    if (!code.includes(`...config.${platform}`)) {
      throw new Error(
        `app.config.ts is missing \`...config.${platform}\` — without it the ` +
          `wholesale \`${platform}: { … }\` discards app.json's ` +
          `${platform === 'android' ? 'versionCode' : 'buildNumber'}`,
      )
    }
  }
  return true
}

/**
 * Assert eas.json leaves versioning to this repo.
 *
 * This check exists because of a trap the single-sourcing work itself sprang.
 * eas-cli refuses `autoIncrement` when a project has only a dynamic config
 * (`ensureStaticConfigExists` throws "not supported when using app.config.js"),
 * so before app.json existed the option was self-blocking — a loud error, not a
 * silent bug. Creating app.json satisfies that guard, so `autoIncrement` now
 * WORKS, and works wrongly:
 *
 *   bump-version commits versionCode 2 → EAS bumps to 3 on the build machine →
 *   the uploaded binary is 3, the repo says 2, and the runner discards the edit.
 *
 * The next release then bumps to 3 again and collides. Nothing in the repo can
 * see that, because the divergence only ever exists on a machine we don't keep.
 *
 * `appVersionSource` is pinned for the same reason from the other direction:
 * `remote` moves the numbers to EAS's servers, which makes app.json — and every
 * check in this directory — decorative. It is required explicitly rather than
 * defaulted, since newer eas-cli versions default it to `remote`.
 *
 * @param {string} text apps/mobile/eas.json
 */
export function assertEasDefersVersioning(text) {
  const eas = JSON.parse(text)

  const source = eas.cli?.appVersionSource
  if (source !== 'local') {
    throw new Error(
      `eas.json: cli.appVersionSource must be "local", got ${JSON.stringify(source)} ` +
        '— "remote" moves versioning to EAS and makes app.json decorative',
    )
  }

  for (const [name, profile] of Object.entries(eas.build ?? {})) {
    if (profile !== null && typeof profile === 'object' && 'autoIncrement' in profile) {
      throw new Error(
        `eas.json: build profile "${name}" sets autoIncrement — versionCode is ` +
          'owned by scripts/bump-version.mjs. EAS would bump it again on the ' +
          'build machine and the runner would discard the edit, so the uploaded ' +
          'binary and the committed repo would permanently disagree',
      )
    }
  }
  return true
}
