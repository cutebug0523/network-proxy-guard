import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { auditVerge, guardOnce, watchGuard } from '../src/guard.js';
import { buildMihomoProfile } from '../src/node-config.js';
import { fakeNode } from './helpers.js';

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-guard-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const vergeDir = path.join(home, 'verge');
  fs.mkdirSync(path.join(vergeDir, 'profiles'), { recursive: true });
  const profile = buildMihomoProfile(fakeNode());
  const item = { uid: 'npg-test', type: 'local', name: fakeNode().name, file: 'node.yaml' };
  fs.writeFileSync(path.join(vergeDir, 'profiles.yaml'), YAML.stringify({ current: item.uid, items: [item] }));
  fs.writeFileSync(path.join(vergeDir, 'profiles', 'node.yaml'), YAML.stringify(profile));
  fs.writeFileSync(path.join(vergeDir, 'config.yaml'), YAML.stringify({ mode: 'rule', ipv6: false, 'mixed-port': 7897 }));
  fs.writeFileSync(path.join(vergeDir, 'verge.yaml'), YAML.stringify({ proxy_auto_config: false, enable_tun_mode: true }));
  return { home, vergeDir, profile };
}

test('guard accepts rule mode, IPv6 off, PAC off and domestic DIRECT', (t) => {
  const { vergeDir } = fixture(t);
  const result = auditVerge(vergeDir);
  assert.equal(result.ok, true);
  assert.equal(result.checked.mode, 'rule');
  assert.equal(result.checked.ipv6, false);
  assert.equal(result.checked.domesticDirect, true);
});

test('guard detects the screenshot drift and repairs only after enforce+yes', (t) => {
  const { home, vergeDir } = fixture(t);
  const configFile = path.join(vergeDir, 'config.yaml');
  const vergeFile = path.join(vergeDir, 'verge.yaml');
  fs.writeFileSync(configFile, YAML.stringify({ mode: 'global', ipv6: true, 'mixed-port': 7897 }));
  fs.writeFileSync(vergeFile, YAML.stringify({ proxy_auto_config: true, enable_tun_mode: true }));
  const originalConfig = fs.readFileSync(configFile, 'utf8');

  const audit = guardOnce({ home, vergeDir });
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.violations.map((item) => item.code).sort(), ['ipv6-enabled', 'mode-not-rule', 'pac-enabled']);
  assert.equal(fs.readFileSync(configFile, 'utf8'), originalConfig);

  const dry = guardOnce({ home, vergeDir, enforce: true });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(fs.readFileSync(configFile, 'utf8'), originalConfig);

  const repaired = guardOnce({ home, vergeDir, enforce: true, yes: true });
  assert.equal(repaired.ok, true);
  const config = YAML.parse(fs.readFileSync(configFile, 'utf8'));
  const verge = YAML.parse(fs.readFileSync(vergeFile, 'utf8'));
  assert.equal(config.mode, 'rule');
  assert.equal(config.ipv6, false);
  assert.equal(config['mixed-port'], 7897);
  assert.equal(verge.proxy_auto_config, false);
  assert.equal(verge.enable_tun_mode, true);
  const backup = repaired.backup.replace(/^~/, home);
  assert.ok(fs.existsSync(path.join(backup, 'original', 'config.yaml')));
});

test('guard reports unsafe routing without rewriting profiles', (t) => {
  const { home, vergeDir, profile } = fixture(t);
  profile.rules = ['MATCH,DIRECT'];
  profile['proxy-groups'].push({ name: 'AutoDirect', type: 'fallback', proxies: ['DIRECT'] });
  const profileFile = path.join(vergeDir, 'profiles', 'node.yaml');
  const original = YAML.stringify(profile);
  fs.writeFileSync(profileFile, original);
  const result = guardOnce({ home, vergeDir, enforce: true, yes: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((item) => item.code).sort(), ['auto-direct-fallback', 'domestic-direct-missing', 'match-direct']);
  assert.equal(fs.readFileSync(profileFile, 'utf8'), original);
});

test('watch reports new drift and remains read-only by default', async (t) => {
  const { vergeDir } = fixture(t);
  const results = [];
  let timer;
  let timeout;
  await new Promise((resolve, reject) => {
    timer = watchGuard({
      vergeDir,
      intervalMs: 10,
      onResult: (result) => {
        results.push(result);
        if (results.length === 1) {
          fs.writeFileSync(path.join(vergeDir, 'config.yaml'), YAML.stringify({ mode: 'global', ipv6: true }));
        } else {
          clearInterval(timer);
          clearTimeout(timeout);
          resolve();
        }
      },
      onError: reject,
    });
    timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error('watch test timed out'));
    }, 2000);
  });
  t.after(() => clearInterval(timer));
  assert.equal(results[0].ok, true);
  assert.equal(results.at(-1).ok, false);
  assert.equal(results.at(-1).checked.mode, 'global');
  assert.equal(results.at(-1).mode, 'audit');
});
