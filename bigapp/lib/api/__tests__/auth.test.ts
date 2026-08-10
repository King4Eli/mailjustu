import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSuperAdminEmail,
  createSession,
  destroySession,
  requireSession,
  requireDomainAdmin,
  requireSuperAdmin,
  ApiAuthError,
} from "../auth.ts";

function mockReq(token?: string): Request {
  return new Request(
    "http://localhost/",
    token ? { headers: { authorization: `Bearer ${token}` } } : {},
  );
}

test("isSuperAdminEmail matches case-insensitively against a comma-separated list", () => {
  process.env.SUPER_ADMIN_EMAILS =
    "Admin@Mail.Example.com, other@mail.example.com";
  assert.equal(isSuperAdminEmail("admin@mail.example.com"), true);
  assert.equal(isSuperAdminEmail("OTHER@MAIL.EXAMPLE.COM"), true);
  assert.equal(isSuperAdminEmail("nobody@mail.example.com"), false);
});

test("isSuperAdminEmail is false when the env var is unset", () => {
  delete process.env.SUPER_ADMIN_EMAILS;
  assert.equal(isSuperAdminEmail("admin@mail.example.com"), false);
});

test("requireSession rejects a missing/unknown token and accepts a valid one", () => {
  assert.throws(() => requireSession(mockReq()), ApiAuthError);

  const token = createSession(
    "user@mail.example.com",
    "pw",
    "user",
    "mail.example.com",
  );
  const session = requireSession(mockReq(token));
  assert.equal(session.email, "user@mail.example.com");
  assert.equal(session.role, "user");

  destroySession(token);
  assert.throws(() => requireSession(mockReq(token)), ApiAuthError);
});

test("requireDomainAdmin admits domain/super roles and rejects plain users, scoping domain admins to their own domain", () => {
  const domainToken = createSession(
    "dadmin@mail.example.com",
    "pw",
    "domain",
    "mail.example.com",
  );
  const { adminScope: scope1 } = requireDomainAdmin(mockReq(domainToken));
  assert.deepEqual(scope1, { role: "domain", domain: "mail.example.com" });

  const superToken = createSession(
    "root@mail.example.com",
    "pw",
    "super",
    "mail.example.com",
  );
  const { adminScope: scope2 } = requireDomainAdmin(mockReq(superToken));
  assert.deepEqual(scope2, { role: "super", domain: null });

  const userToken = createSession(
    "plain@mail.example.com",
    "pw",
    "user",
    "mail.example.com",
  );
  assert.throws(() => requireDomainAdmin(mockReq(userToken)), ApiAuthError);
});

test("requireSuperAdmin rejects domain admins, only admits super", () => {
  const domainToken = createSession(
    "dadmin@mail.example.com",
    "pw",
    "domain",
    "mail.example.com",
  );
  assert.throws(() => requireSuperAdmin(mockReq(domainToken)), ApiAuthError);

  const superToken = createSession(
    "root@mail.example.com",
    "pw",
    "super",
    "mail.example.com",
  );
  const session = requireSuperAdmin(mockReq(superToken));
  assert.equal(session.role, "super");
});
