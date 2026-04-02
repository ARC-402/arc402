const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DaemonClient,
  DaemonNodeClient,
  loadLocalDaemonToken,
  resolveDaemonHttpBaseUrl,
  resolveDaemonApiBaseUrl,
  DEFAULT_DAEMON_HTTP_URL,
  DEFAULT_DAEMON_API_URL,
} = require('../dist');

test('daemon URL helpers infer split ports from daemon.toml', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc402-sdk-daemon-'));
  const configPath = path.join(tmp, 'daemon.toml');
  fs.writeFileSync(configPath, '[relay]\nlisten_port = 5510\n');

  assert.equal(resolveDaemonHttpBaseUrl(configPath), 'http://127.0.0.1:5510');
  assert.equal(resolveDaemonApiBaseUrl({ configPath }), 'http://127.0.0.1:5511');
  assert.equal(resolveDaemonApiBaseUrl({ baseUrl: 'https://node.example.com/' }), 'https://node.example.com');
});

test('daemon token loader trims file contents and tolerates missing file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc402-sdk-token-'));
  const tokenPath = path.join(tmp, 'daemon.token');
  fs.writeFileSync(tokenPath, 'secret-token\n');

  assert.equal(loadLocalDaemonToken(tokenPath), 'secret-token');
  assert.equal(loadLocalDaemonToken(path.join(tmp, 'missing.token')), undefined);
});

test('daemon client reads split API endpoints and keeps compatibility aliases', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const pathname = new URL(url).pathname;
    const payloads = {
      '/health': { ok: true, wallet: '0xabc' },
      '/wallet/status': { ok: true, wallet: '0xabc', daemonId: '0xabc', chainId: 8453, rpcUrl: 'http://rpc', policyEngineAddress: '0xdef' },
      '/workroom/status': { ok: true, status: 'running' },
      '/agreements': { ok: true, agreements: [{ agreement_id: '1' }] },
      '/auth/challenge': { challengeId: 'cid', challenge: 'sign me', daemonId: '0xabc', wallet: '0xabc', chainId: 8453, scope: 'operator', expiresAt: 1, issuedAt: 1 },
      '/auth/session': { ok: true, token: 'tok', wallets: ['0xabc'], wallet: '0xabc', scope: 'operator', expiresAt: 2 },
      '/auth/revoke': { ok: true },
    };
    return new Response(JSON.stringify(payloads[pathname]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:6603', token: 'daemon-token' });
    const aliasClient = new DaemonNodeClient({ apiUrl: 'http://127.0.0.1:6603', token: 'daemon-token' });

    assert.equal(client.apiUrl, 'http://127.0.0.1:6603');
    assert.equal(aliasClient.apiUrl, 'http://127.0.0.1:6603');
    assert.equal(DEFAULT_DAEMON_HTTP_URL, 'http://127.0.0.1:4402');
    assert.equal(DEFAULT_DAEMON_API_URL, 'http://127.0.0.1:4403');

    assert.deepEqual(await client.health(), { ok: true, wallet: '0xabc' });
    assert.equal((await client.walletStatus()).chainId, 8453);
    assert.equal((await client.workroomStatus()).status, 'running');
    assert.equal((await client.agreements()).agreements.length, 1);
    assert.equal((await client.requestAuthChallenge('0xabc')).challengeId, 'cid');
    assert.equal((await client.createSession('cid', '0xsig')).ok, true);
    assert.equal((await client.revokeSession()).ok, true);
    assert.deepEqual(await aliasClient.getHealth(), { ok: true, wallet: '0xabc' });

    const challengeCall = calls.find((entry) => new URL(entry.url).pathname === '/auth/challenge');
    assert.equal(challengeCall.init.method, 'POST');
    assert.equal(challengeCall.init.headers.Authorization, undefined);
    assert.match(challengeCall.init.body, /"wallet":"0xabc"/);
  } finally {
    global.fetch = originalFetch;
  }
});
