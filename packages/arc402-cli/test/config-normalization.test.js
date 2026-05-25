const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadConfigModule(configPath) {
  process.env.ARC402_CONFIG = configPath;
  const modulePath = require.resolve('../dist/config.js');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('loadConfig pins canonical protocol addresses and clears stale onboarding state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc402-config-'));
  const configPath = path.join(tmpDir, 'config.json');

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      network: 'base-mainnet',
      rpcUrl: 'https://example-rpc.invalid',
      walletContractAddress: '0x2C437f6bBee3895C6291492BC518640B1360d032',
      walletAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      arc402WalletAddress: '0xfd5C8c0a08fDcdeD2fe03e0DC9FA55595667F313',
      agentRegistryAddress: '0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622',
      trustRegistryAddress: '0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2',
      intentAttestationAddress: '0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460',
      onboardingProgress: {
        walletAddress: '0x9284903620A2c6049e5dEDa3D4D55FAd6c5094E5',
        step: 2,
        completedSteps: ['machineKey'],
      },
    }, null, 2),
  );

  const { loadConfig } = loadConfigModule(configPath);
  const config = loadConfig();
  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.equal(config.agentRegistryAddress, '0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865');
  assert.equal(config.agentRegistryV2Address, '0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865');
  assert.equal(config.arc402RegistryV3Address, '0x6EafeD4FA103D2De04DDee157e35A8e8df91B6A6');
  assert.equal(config.trustRegistryAddress, '0x22366D6dabb03062Bc0a5E893EfDff15D8E329b1');
  assert.equal(config.intentAttestationAddress, '0x66585C2F96cAe05EA360F6dBF76bA092A7B87669');
  assert.equal(saved.walletAddress, '0x2C437f6bBee3895C6291492BC518640B1360d032');
  assert.equal(saved.arc402WalletAddress, undefined);
  assert.equal(saved.onboardingProgress, undefined);

  delete process.env.ARC402_CONFIG;
});
