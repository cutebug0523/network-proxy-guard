import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeNode } from './helpers.js';
import { buildVlessUri } from '../src/node-config.js';
import { generateMobileQr } from '../src/qr.js';

test('QR and link are generated locally from the same private payload', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-qr-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = await generateMobileQr(fakeNode(), directory);
  assert.equal(fs.readFileSync(result.linkFile, 'utf8'), `${buildVlessUri(fakeNode())}\n`);
  assert.equal(fs.readFileSync(result.qrFile).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(fs.statSync(result.linkFile).mode & 0o777, 0o600);
  assert.equal(fs.statSync(result.qrFile).mode & 0o777, 0o600);
});
