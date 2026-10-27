import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLisaTicket, classifyGoogleRegion } from '../src/diagnostics.js';
import { displayUrl, redactUrl } from '../src/utils.js';

const geo = [
  { service: 'ipinfo', ip: '203.0.113.10', country: 'US', city: 'Los Angeles' },
  { service: 'ipwhois', ip: '203.0.113.10', country: 'US', city: 'Los Angeles' },
];

test('Google HK requires VPS-direct evidence and the same US IPv4', () => {
  const location = 'https://www.google.com.hk/';
  assert.equal(classifyGoogleRegion({ location, geo, serverDirect: false }), 'needs-vps-direct-test');
  assert.equal(classifyGoogleRegion({ location, geo, serverDirect: true }), 'google-region-mismatch');
  assert.equal(classifyGoogleRegion({ location: null, geo, serverDirect: true }), 'no-google-hk-redirect');
  const mixedIps = [geo[0], { ...geo[1], ip: '203.0.113.11' }];
  assert.equal(classifyGoogleRegion({ location, geo: mixedIps, serverDirect: true }), 'provider-or-geo-data-mismatch');
});

test('Lisa ticket is a no-reinstall draft backed by VPS evidence', () => {
  const ticket = buildLisaTicket({
    classification: 'google-region-mismatch', serverDirect: true,
    evidenceIp: '203.0.113.10',
    testedAt: '2026-01-01T00:00:00Z', perspective: 'VPS direct over SSH',
    google: { location: 'https://www.google.com.hk/' }, geo,
  });
  assert.ok(ticket.includes('203.0.113.10'));
  assert.ok(ticket.includes('请勿直接重装、重置或迁移实例'));
  assert.ok(ticket.includes('VPS 本机直接访问'));
  assert.ok(ticket.includes('可能影响'));
  assert.ok(!ticket.includes('已影响'));
});

test('display URLs remove credentials, query and fragments', () => {
  const shown = displayUrl('https://user:password@example.com/path?access_token=secret&ok=1#fragment');
  assert.equal(shown, 'https://example.com/path');
  const redacted = redactUrl('https://example.com/path?access_token=secret&ok=1#fragment');
  assert.ok(!redacted.includes('secret'));
  assert.ok(!redacted.includes('fragment'));
});

test('proxy credentials are redacted', () => {
  const redacted = redactUrl('http://user:password@127.0.0.1:7897');
  assert.ok(!redacted.includes('password'));
  assert.ok(!redacted.includes('user:'));
});
