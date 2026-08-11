import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
} from "../rateLimit.ts";

test("isRateLimited allows an unseen key", () => {
  assert.equal(isRateLimited("unseen-key", 3).limited, false);
});

test("recordFailedAttempt trips the limit at max attempts", () => {
  const key = "trip-at-max";
  recordFailedAttempt(key, 60_000);
  recordFailedAttempt(key, 60_000);
  assert.equal(isRateLimited(key, 3).limited, false);
  recordFailedAttempt(key, 60_000);
  const status = isRateLimited(key, 3);
  assert.equal(status.limited, true);
  assert.ok(status.retryAfterSeconds > 0);
});

test("clearAttempts resets a tripped key", () => {
  const key = "clear-me";
  recordFailedAttempt(key, 60_000);
  recordFailedAttempt(key, 60_000);
  assert.equal(isRateLimited(key, 2).limited, true);
  clearAttempts(key);
  assert.equal(isRateLimited(key, 2).limited, false);
});

test("a window in the past is treated as expired, not limited", () => {
  const key = "expired-window";
  recordFailedAttempt(key, -1);
  assert.equal(isRateLimited(key, 1).limited, false);
});
