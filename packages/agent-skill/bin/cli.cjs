#!/usr/bin/env node
'use strict'
/**
 * npx @tenda/agent-skill <command>
 *
 *   install [--dir PATH] [--force]   copy the skill into an agent's skills folder
 *   print                            write SKILL.md to stdout
 *   path                             print where the packaged skill lives
 *
 * The default target is ~/.claude/skills/tenda-hire-a-human, which Claude Code
 * reads; --dir points any other agent's skills folder at it. Nothing is
 * downloaded at install time: the skill is the files in this package.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SKILL_DIR = path.join(__dirname, '..', 'skill')
const SKILL_NAME = 'tenda-hire-a-human'

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(source, target)
    else fs.copyFileSync(source, target)
  }
}

function main(argv, io) {
  const [command, ...rest] = argv
  const flags = new Set(rest.filter((a) => a.startsWith('--')))
  const dirIndex = rest.indexOf('--dir')
  const dir = dirIndex >= 0 ? rest[dirIndex + 1] : undefined
  if (command === 'print') {
    io.out(fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8'))
    return 0
  }
  if (command === 'path') {
    io.out(SKILL_DIR)
    return 0
  }
  if (command === 'install') {
    if (dirIndex >= 0 && (dir === undefined || dir.startsWith('--'))) {
      io.err('--dir needs a path')
      return 1
    }
    const target = path.resolve(dir ?? path.join(os.homedir(), '.claude', 'skills', SKILL_NAME))
    if (fs.existsSync(target) && !flags.has('--force')) {
      io.err(`${target} already exists: pass --force to replace it`)
      return 1
    }
    fs.rmSync(target, { recursive: true, force: true })
    copyDir(SKILL_DIR, target)
    io.out(`installed ${SKILL_NAME} to ${target}`)
    io.out(`try: node ${path.join(target, 'scripts', 'tenda.cjs')} chains   (set TENDA_API first)`)
    return 0
  }
  io.err('usage: tenda-agent-skill install [--dir PATH] [--force] | print | path')
  return command === undefined || command === 'help' || command === '--help' ? 0 : 1
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), { out: (t) => console.log(t), err: (t) => console.error(t) })
}

module.exports = { main, SKILL_DIR, SKILL_NAME }
