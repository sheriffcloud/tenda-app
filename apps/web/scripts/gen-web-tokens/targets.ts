/**
 * What the generator can write, and where.
 *
 * Its own module rather than part of the CLI so a test can read the map
 * without running the CLI — `main.ts` writes files the moment it is imported,
 * which is exactly the kind of import a suite must not perform.
 *
 * Each target names its regenerate command ONCE. It is passed to the renderer
 * (which stamps it into the file's header) and printed by the drift check when
 * the file is stale, and those two must be the same string: the check compares
 * a fresh render against the file on disk, so a header naming the wrong app is
 * written consistently and the gate cannot see it. Naming it twice is how that
 * happens; naming it once is why it cannot.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from './core'
import { renderTendahq } from './tendahq'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface Target {
  /** Takes the command that rewrites this target, for the header it stamps. */
  render(regen: string): string
  out: string
  regen: string
}

export const TARGETS: Record<string, Target> = {
  web: {
    render,
    out: join(HERE, '../../styles/tokens.css'),
    regen: 'pnpm --filter web gen:tokens',
  },
  tendahq: {
    render: renderTendahq,
    out: join(HERE, '../../../tendahq/src/styles/tokens.css'),
    regen: 'pnpm --filter tendahq gen:tokens',
  },
  // The agent docs site (#157 stage 2). Same renderer as the landing, not a
  // second one: both are Vite + Tailwind v4 and want the one light-dark()
  // block, so a docs-specific shape would be a copy of tendahq.ts that could
  // drift from it.
  docs: {
    render: renderTendahq,
    out: join(HERE, '../../../docs/src/styles/tokens.css'),
    regen: 'pnpm --filter tenda-docs gen:tokens',
  },
}

/** The target `--target <name>` asks for; exits 2 on a name nothing declares. */
export function targetFromArgv(argv: readonly string[]): Target {
  const at = argv.indexOf('--target')
  const name = at === -1 ? 'web' : argv[at + 1]
  if (name === undefined || !Object.hasOwn(TARGETS, name)) {
    console.error(`tokens: unknown --target "${name ?? ''}" (expected ${Object.keys(TARGETS).join(' | ')})`)
    process.exit(2)
  }
  return TARGETS[name]
}
