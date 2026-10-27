import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fakeNode } from './helpers.js';
import { setupProxy } from '../src/setup.js';

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-setup-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const vergeDir = path.join(home, 'verge');
  fs.mkdirSync(path.join(vergeDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(vergeDir, 'profiles.yaml'), YAML.stringify({ current: 'old', items: [{ uid: 'old', type: 'local', name: 'Old', file: 'old.yaml' }] }));
  fs.writeFileSync(path.join(vergeDir, 'profiles', 'old.yaml'), 'proxies: []\n');
  fs.writeFileSync(path.join(vergeDir, 'config.yaml'), YAML.stringify({ 'mixed-port': 7897, mode: 'global', ipv6: true }));
  fs.writeFileSync(path.join(vergeDir, 'verge.yaml'), YAML.stringify({ enable_system_proxy: false, proxy_auto_config: true, enable_tun_mode: false }));
  return { home, vergeDir };
}

const runtime = {
  isRunning: async () => false,
  validate: async () => ({ ok: true, skipped: false, reason: 'fake core passed' }),
};

test('setup dry-run is inert and apply preserves existing profiles and creates backup', async (t) => {
  const { home, vergeDir } = fixture(t);
  const before = fs.readFileSync(path.join(vergeDir, 'profiles.yaml'), 'utf8');
  const dry = await setupProxy({ home, vergeDir, node: fakeNode(), runtime });
  assert.equal(dry.plan.mode, 'dry-run');
  assert.equal(dry.plan.mixedPort, 7897);
  assert.equal(fs.readFileSync(path.join(vergeDir, 'profiles.yaml'), 'utf8'), before);

  const result = await setupProxy({ home, vergeDir, node: fakeNode(), yes: true, runtime });
  const profiles = YAML.parse(fs.readFileSync(path.join(vergeDir, 'profiles.yaml'), 'utf8'));
  assert.equal(profiles.items.length, 2);
  assert.ok(profiles.items.some((item) => item.uid === 'old'));
  assert.equal(profiles.current, result.plan.activate);
  const base = YAML.parse(fs.readFileSync(path.join(vergeDir, 'config.yaml'), 'utf8'));
  assert.equal(base.mode, 'rule');
  assert.equal(base.ipv6, false);
  assert.equal(base['mixed-port'], 7897);
  const verge = YAML.parse(fs.readFileSync(path.join(vergeDir, 'verge.yaml'), 'utf8'));
  assert.equal(verge.enable_system_proxy, true);
  assert.equal(verge.proxy_auto_config, false);
  assert.equal(verge.enable_tun_mode, false);
  const backup = result.backup.replace(/^~/, home);
  assert.ok(fs.existsSync(path.join(backup, 'original', 'profiles.yaml')));
});

test('TUN apply stops before changes when privileged service is unavailable', async (t) => {
  const { home, vergeDir } = fixture(t);
  const before = fs.readFileSync(path.join(vergeDir, 'profiles.yaml'), 'utf8');
  await assert.rejects(setupProxy({
    home, vergeDir, node: fakeNode(), yes: true, enableTun: true,
    runtime: { ...runtime, checkTun: async () => false },
  }), /TUN privileged service is not ready/);
  assert.equal(fs.readFileSync(path.join(vergeDir, 'profiles.yaml'), 'utf8'), before);
});

test('failed core validation leaves all original files unchanged', async (t) => {
  const { home, vergeDir } = fixture(t);
  const files = ['profiles.yaml', 'config.yaml', 'verge.yaml'];
  const before = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(vergeDir, file), 'utf8')]));
  await assert.rejects(setupProxy({
    home, vergeDir, node: fakeNode(), yes: true,
    runtime: { ...runtime, validate: async () => ({ ok: false, skipped: false, reason: 'invalid fixture' }) },
  }), /failed validation/);
  for (const file of files) assert.equal(fs.readFileSync(path.join(vergeDir, file), 'utf8'), before[file]);
});
