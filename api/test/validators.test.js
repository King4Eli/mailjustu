import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMailboxEmail, isValidFolderName } from '../src/validators.js'

test('normalizeMailboxEmail accepts a plain address and lowercases/trims it', () => {
  assert.deepEqual(normalizeMailboxEmail('  Jordan@Mail.Example.com  '), {
    email: 'jordan@mail.example.com',
    domain: 'mail.example.com',
  })
})

test('normalizeMailboxEmail rejects missing @, whitespace, or empty input', () => {
  assert.equal(normalizeMailboxEmail('not-an-email'), null)
  assert.equal(normalizeMailboxEmail('has spaces@mail.example.com'), null)
  assert.equal(normalizeMailboxEmail(''), null)
  assert.equal(normalizeMailboxEmail(undefined), null)
})

test('isValidFolderName accepts ordinary names', () => {
  assert.equal(isValidFolderName('Projects'), true)
  assert.equal(isValidFolderName('2026 Taxes'), true)
})

test('isValidFolderName rejects empty names and path separators', () => {
  assert.equal(isValidFolderName(''), false)
  assert.equal(isValidFolderName(undefined), false)
  assert.equal(isValidFolderName('a/b'), false)
  assert.equal(isValidFolderName('a\\b'), false)
})
