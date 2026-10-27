import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLisaTicket, classifyGoogleRegion } from '../src/diagnostics.js';
import { redactUrl } from '../src/utils.js';

const geo = [
  { service: 'ipinfo', ip: '203.0.113.10', country: 'US', city: 'Los Angeles' },
  { service: 'ipwhois', ip: '203.0.113.10', country: 'US', city: 'Los Angeles' },
];

test('Google HK requires VPS-direct evidence and multiple US geo results', () => {
  const location = 'https://www.google.com.hk/';
  assert.equal(classifyGoogleRegion({ location, geo, serverDirect: false }), 'needs-vps-direct-test');
  assert.equal(classifyGoogleRegion({ location, geo, serverDirect: true }), 'google-region-mismatch');
  assert.equal(classifyGoogleRegion({ location: null, geo, serverDirect: true }), 'no-google-hk-redirect');
});

test('Lisa ticket is a no-reinstall draft backed by VPS evidence', () => {
  const ticket = buildLisaTicket({
    classification: 'google-region-mismatch', serverDirect: true,
    testedAt: '2026-01-01T00:00:00Z', perspective: 'VPS direct over SSH',
    google: { location: 'https://www.google.com.hk/' }, geo,
  });
  assert.ok(ticket.includes('203.0.113.10'));
  assert.ok(ticket.includes('请勿直接重装、重置或迁移实例'));
  assert.ok(ticket.includes('VPS 本机直接访问'));
});

test('proxy credentials are redacted', () => {
  const redacted = redactUrl('http://user:password@127.0.0.1:7897');
  assert.ok(!redacted.includes('password'));
  assert.ok(!redacted.includes('user:'));
});
