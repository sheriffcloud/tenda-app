/**
 * Writes (or, with --check, verifies) the generated half of the skill:
 * skill/SKILL.md and skill/generated.json. The committed copies are what the
 * npm tarball ships, so CI runs `--check` to fail a change to the API's
 * constants or the document that did not regenerate them.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderFacts, renderSkill } from './render'

const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
const facts = renderFacts()
const outputs: ReadonlyArray<readonly [string, string]> = [
  [join(root, 'skill/SKILL.md'), renderSkill(readFileSync(join(root, 'templates/SKILL.template.md'), 'utf8'), pkg.version, facts)],
  [join(root, 'skill/generated.json'), JSON.stringify(facts, null, 2) + '\n'],
]

const check = process.argv.includes('--check')
let stale = 0
for (const [file, content] of outputs) {
  let current = ''
  try {
    current = readFileSync(file, 'utf8')
  } catch {
    current = ''
  }
  if (check) {
    if (current !== content) {
      console.error(`stale: ${file} (run \`pnpm --filter @tenda/agent-skill build:skill\`)`)
      stale++
    }
  } else if (current !== content) {
    writeFileSync(file, content)
    console.log(`wrote ${file}`)
  }
}
if (check) {
  if (stale > 0) process.exit(1)
  console.log('agent skill is up to date')
}
