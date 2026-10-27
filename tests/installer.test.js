import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/network-proxy-guard.js', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

test('npm CLI installs files only and force update preserves a backup', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = run(['install', '--target', root]);
  assert.equal(first.status, 0, first.stderr);
  const destination = path.join(root, 'network-proxy-guard');
  assert.ok(fs.existsSync(path.join(destination, 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(destination, 'assets', 'node.example.json')));

  const duplicate = run(['install', '--target', root]);
  assert.equal(duplicate.status, 1);
  const forced = run(['install', '--target', root, '--force']);
  assert.equal(forced.status, 0, forced.stderr);
  const entries = fs.readdirSync(root);
  assert.ok(entries.some((entry) => entry.startsWith('network-proxy-guard.backup-')));
});
