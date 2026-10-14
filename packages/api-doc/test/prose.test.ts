/**
 * The prose helpers decide what CommonMark sees: blocks are separated by a
 * BLANK line (a single newline folds into a space), a list is ONE block whose
 * lines are not blank-separated, and a fence carries its bytes untouched.
 * The document suites read the rendered result, so a wrong join passed them
 * as long as the words survived.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocks, bullets, fence, steps } from '../src/prose'

test('blocks() separates parts with exactly one BLANK line', () => {
  assert.equal(blocks('a', 'b', 'c'), 'a\n\nb\n\nc')
})

test('blocks() of one part is that part, of none is empty', () => {
  assert.equal(blocks('only'), 'only')
  assert.equal(blocks(), '')
})

test('fence() wraps the body in an untagged fence and keeps its bytes', () => {
  assert.equal(fence('x\n  y'), '```\nx\n  y\n```')
})

test('bullets() is one block: a dash per item, newline-joined, no blank lines', () => {
  assert.equal(bullets('one', 'two'), '- one\n- two')
  assert.equal(bullets(), '')
})

test('steps() numbers from 1 and keeps the order', () => {
  assert.equal(steps('first', 'second', 'third'), '1. first\n2. second\n3. third')
  assert.equal(steps(), '')
})
