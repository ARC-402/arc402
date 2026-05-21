import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeRpcProblem } from '../../dist/commands/doctor.js';

// An RPC that throttles / times out / returns nothing must be classified as an
// RPC problem (inconclusive), NOT a machine-key auth failure. A genuine revert
// must still classify as false so a real de-authorization surfaces as a failure.

test('rate-limit JSON-RPC error code (-32016) is an RPC problem', () => {
  assert.equal(looksLikeRpcProblem({ error: { code: -32016, message: 'over rate limit' } }), true);
});

test('HTTP 429 nested under info.error is an RPC problem', () => {
  assert.equal(looksLikeRpcProblem({ info: { error: { code: 429, message: 'Too Many Requests' } } }), true);
});

test('rate-limit / 429 text in the message is an RPC problem', () => {
  assert.equal(looksLikeRpcProblem(new Error('429 Too Many Requests: rate limit exceeded')), true);
});

test('timeout is an RPC problem', () => {
  assert.equal(looksLikeRpcProblem(new Error('timeout')), true);
});

test('connection errors (ECONNRESET / ETIMEDOUT) are RPC problems', () => {
  assert.equal(looksLikeRpcProblem(new Error('connect ECONNRESET')), true);
  assert.equal(looksLikeRpcProblem(new Error('ETIMEDOUT')), true);
});

test('empty-response CALL_EXCEPTION ("missing revert data") is an RPC problem', () => {
  // This is the exact shape the throttled public RPC produced.
  assert.equal(
    looksLikeRpcProblem({ code: 'CALL_EXCEPTION', shortMessage: 'missing revert data' }),
    true
  );
});

test('a genuine contract revert is NOT an RPC problem', () => {
  // Carries a reason / execution-reverted text — must stay a hard failure so a
  // real de-authorization is not silently downgraded to "inconclusive".
  assert.equal(
    looksLikeRpcProblem({ code: 'CALL_EXCEPTION', shortMessage: 'execution reverted', reason: 'Unauthorized' }),
    false
  );
});

test('an unrelated error is NOT an RPC problem', () => {
  assert.equal(looksLikeRpcProblem(new Error('something else entirely')), false);
});
