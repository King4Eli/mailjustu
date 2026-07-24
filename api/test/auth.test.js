import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSuperAdminEmail,
  createSession,
  destroySession,
  requireSession,
  requireDomainAdmin,
  requireSuperAdmin,
} from '../src/middleware/auth.js'

function mockReq(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} }
}

function mockRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => {
    res.body = body
    return res
  }
  return res
}

test('isSuperAdminEmail matches case-insensitively against a comma-separated list', () => {
  process.env.SUPER_ADMIN_EMAILS = 'Admin@Mail.Example.com, other@mail.example.com'
  assert.equal(isSuperAdminEmail('admin@mail.example.com'), true)
  assert.equal(isSuperAdminEmail('OTHER@MAIL.EXAMPLE.COM'), true)
  assert.equal(isSuperAdminEmail('nobody@mail.example.com'), false)
})

test('isSuperAdminEmail is false when the env var is unset', () => {
  delete process.env.SUPER_ADMIN_EMAILS
  assert.equal(isSuperAdminEmail('admin@mail.example.com'), false)
})

test('requireSession rejects a missing/unknown token and accepts a valid one', () => {
  const noToken = mockReq()
  const noTokenRes = mockRes()
  let nextCalled = false
  requireSession(noToken, noTokenRes, () => { nextCalled = true })
  assert.equal(noTokenRes.statusCode, 401)
  assert.equal(nextCalled, false)

  const token = createSession('user@mail.example.com', 'pw', 'user', 'mail.example.com')
  const req = mockReq(token)
  const res = mockRes()
  requireSession(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(req.mailSession.email, 'user@mail.example.com')
  assert.equal(req.mailSession.role, 'user')

  destroySession(token)
  const afterDestroy = mockRes()
  let calledAfterDestroy = false
  requireSession(mockReq(token), afterDestroy, () => { calledAfterDestroy = true })
  assert.equal(afterDestroy.statusCode, 401)
  assert.equal(calledAfterDestroy, false)
})

test('requireDomainAdmin admits domain/super roles and rejects plain users, scoping domain admins to their own domain', () => {
  const domainToken = createSession('dadmin@mail.example.com', 'pw', 'domain', 'mail.example.com')
  const req1 = mockReq(domainToken)
  requireDomainAdmin(req1, mockRes(), () => {})
  assert.deepEqual(req1.adminScope, { role: 'domain', domain: 'mail.example.com' })

  const superToken = createSession('root@mail.example.com', 'pw', 'super', 'mail.example.com')
  const req2 = mockReq(superToken)
  requireDomainAdmin(req2, mockRes(), () => {})
  assert.deepEqual(req2.adminScope, { role: 'super', domain: null })

  const userToken = createSession('plain@mail.example.com', 'pw', 'user', 'mail.example.com')
  const res3 = mockRes()
  let called = false
  requireDomainAdmin(mockReq(userToken), res3, () => { called = true })
  assert.equal(res3.statusCode, 401)
  assert.equal(called, false)
})

test('requireSuperAdmin rejects domain admins, only admits super', () => {
  const domainToken = createSession('dadmin@mail.example.com', 'pw', 'domain', 'mail.example.com')
  const res1 = mockRes()
  let called1 = false
  requireSuperAdmin(mockReq(domainToken), res1, () => { called1 = true })
  assert.equal(res1.statusCode, 401)
  assert.equal(called1, false)

  const superToken = createSession('root@mail.example.com', 'pw', 'super', 'mail.example.com')
  let called2 = false
  requireSuperAdmin(mockReq(superToken), mockRes(), () => { called2 = true })
  assert.equal(called2, true)
})
