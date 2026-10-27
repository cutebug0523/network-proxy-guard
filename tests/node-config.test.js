import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeNode } from './helpers.js';
import { buildMihomoProfile, buildVlessUri, validateNodeConfig } from '../src/node-config.js';

test('VLESS URI preserves Reality parameters', () => {
  const uri = buildVlessUri(fakeNode());
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, 'vless:');
  assert.equal(parsed.username, fakeNode().uuid);
  assert.equal(parsed.port, '443');
  assert.equal(parsed.searchParams.get('security'), 'reality');
  assert.equal(parsed.searchParams.get('flow'), 'xtls-rprx-vision');
  assert.equal(parsed.searchParams.get('pbk'), fakeNode().publicKey);
  assert.equal(parsed.searchParams.get('spx'), '/');
  assert.equal(decodeURIComponent(parsed.hash.slice(1)), fakeNode().name);
});

test('profile keeps sensitive traffic fail-closed and server management direct', () => {
  const profile = buildMihomoProfile(fakeNode());
  assert.deepEqual(profile['proxy-groups'][0].proxies, [fakeNode().name]);
  assert.ok(profile.rules[0].includes('DIRECT,no-resolve'));
  assert.ok(profile.rules.findIndex((rule) => rule.includes('stripe.com')) < profile.rules.findIndex((rule) => rule.startsWith('GEOIP,CN')));
  assert.equal(profile.rules.at(-1), 'MATCH,节点选择');
});

test('flow is omitted unless the node explicitly uses one', () => {
  const node = fakeNode();
  delete node.flow;
  assert.equal(new URL(buildVlessUri(node)).searchParams.has('flow'), false);
  assert.equal('flow' in buildMihomoProfile(node).proxies[0], false);
});

test('invalid or placeholder config is rejected', () => {
  assert.throws(() => validateNodeConfig({ ...fakeNode(), port: 70000 }), /port/);
  assert.throws(() => validateNodeConfig({ ...fakeNode(), publicKey: 'REPLACE_WITH_REALITY_PUBLIC_KEY' }), /placeholder/);
  assert.throws(() => validateNodeConfig({ ...fakeNode(), publicKey: 'A'.repeat(44) }), /Public key/);
  assert.throws(() => validateNodeConfig({ ...fakeNode(), publicKey: 'A'.repeat(42) }), /Public key/);
  assert.throws(() => validateNodeConfig({ ...fakeNode(), shortId: 'abc' }), /even-length/);
});
