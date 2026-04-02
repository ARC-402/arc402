const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DaemonClient,
  DaemonClientError,
  resolveDaemonApiBaseUrl,
  loadLocalDaemonToken,
} = require('../dist');

test('resolveDaemonApiBaseUrl prefers explicit value and trims trailing slashes', () => {
  assert.equal(resolveDaemonApiBaseUrl(), 'http://127.0.0.1:4403');
  assert.equal(resolveDaemonApiBaseUrl({ apiUrl: 'http://example.com:1234/' }), 'http://example.com:1234');
});

test('loadLocalDaemonToken reads trimmed token values', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arc402-sdk-daemon-'));
  const tokenPath = path.join(dir, 'daemon.token');
  await fs.promises.writeFile(tokenPath, 'secret-token\n', 'utf8');
  assert.equal(loadLocalDaemonToken(tokenPath), 'secret-token');
});

test('DaemonClient sends bearer token to authenticated endpoints', async () => {
  const calls = [];
  const daemon = new DaemonClient({
    apiUrl: 'http://127.0.0.1:4403',
    token: 'token-123',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, status: 'running' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await daemon.getWorkroomStatus();
  assert.deepEqual(result, { ok: true, status: 'running' });
  assert.equal(calls[0].url, 'http://127.0.0.1:4403/workroom/status');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-123');
});

test('DaemonClient exposes auth challenge and session endpoints without bearer auth', async () => {
  const seen = [];
  const daemon = new DaemonClient({
    apiUrl: 'http://node.example.com',
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith('/auth/challenge')) {
        return new Response(JSON.stringify({
          challengeId: 'abc',
          challenge: 'ARC-402 Remote Auth\nChallenge: 0x123',
          daemonId: '0x0000000000000000000000000000000000000001',
          wallet: '0x0000000000000000000000000000000000000002',
          chainId: 8453,
          scope: 'operator',
          expiresAt: 123,
          issuedAt: 100,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        ok: true,
        token: 'session-token',
        wallets: ['0x0000000000000000000000000000000000000002'],
        wallet: '0x0000000000000000000000000000000000000002',
        scope: 'operator',
        expiresAt: 999,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const challenge = await daemon.requestAuthChallenge('0x0000000000000000000000000000000000000002');
  const session = await daemon.createSession('abc', '0xsig');

  assert.equal(challenge.challengeId, 'abc');
  assert.equal(session.token, 'session-token');
  assert.equal(seen[0].init.headers.Authorization, undefined);
  assert.equal(seen[1].init.headers.Authorization, undefined);
});

test('DaemonClient throws typed errors for HTTP failures', async () => {
  const daemon = new DaemonClient({
    token: 'token-123',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid_session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  await assert.rejects(
    daemon.getWalletStatus(),
    (error) => {
      assert.ok(error instanceof DaemonClientError);
      assert.equal(error.message, 'invalid_session');
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});
