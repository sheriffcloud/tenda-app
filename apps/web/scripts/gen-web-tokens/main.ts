/**
 * CLI for the design-token generator — the single source of truth is
 * apps/mobile/theme/tokens.ts (master-plan decision #9). Never hand-edit an
 * output; change the mobile tokens and regenerate.
 *
 *   pnpm --filter web gen:tokens              # write web/styles/tokens.css
 *   pnpm --filter web gen:tokens:check        # exit 1 if regenerating would diff (CI)
 *   pnpm --filter tendahq gen:tokens          # the same, for tendahq/src/styles/tokens.css
 *   pnpm --filter tendahq gen:tokens:check
 *   pnpm --filter tenda-docs gen:tokens       # and for docs/src/styles/tokens.css
 *
 * `--target web|tendahq|docs` picks the output (default web, the original) —
 * the map of what each one renders and where lives in ./targets. Web's
 * theme shape follows the ui-ux brief: full light palette on bare :root,
 * system dark behind prefers-color-scheme guarded by :root:not([data-theme=
 * "light"]), and an explicit :root[data-theme="dark"] block so a toggle wins
 * in both directions. tendahq's is one light-dark() block — see tendahq.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { targetFromArgv } from './targets'

const target = targetFromArgv(process.argv)
const css = target.render(target.regen)
const shown = relative(process.cwd(), target.out)
if (process.argv.includes('--check')) {
  let existing = ''
  try {
    existing = readFileSync(target.out, 'utf8')
  } catch {
    console.error(`tokens check: ${shown} is missing — run ${target.regen}`)
    process.exit(1)
  }
  if (existing !== css) {
    console.error(`tokens check: ${shown} is stale — run ${target.regen} and commit the diff`)
    process.exit(1)
  }
  console.log(`tokens check: ${shown} is up to date`)
} else {
  mkdirSync(dirname(target.out), { recursive: true })
  writeFileSync(target.out, css)
  console.log(`wrote ${shown}`)
}
