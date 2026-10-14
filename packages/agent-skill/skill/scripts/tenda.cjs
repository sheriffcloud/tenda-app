#!/usr/bin/env node
'use strict'
/** The command line over ./lib.cjs. Node 18+, no dependencies, no keys. */
const fs = require('node:fs')
const { run } = require('./lib.cjs')

run(process.argv.slice(2), {
  env: process.env,
  fetch: globalThis.fetch,
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  writeFile: (file, text) => fs.writeFileSync(file, text),
  exists: (file) => fs.existsSync(file),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}).then((code) => {
  process.exitCode = code
})
