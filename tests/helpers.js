export function fakeNode() {
  return {
    name: 'Test-US-01',
    address: '203.0.113.10',
    port: 443,
    uuid: '11111111-1111-4111-8111-111111111111',
    publicKey: 'A'.repeat(43),
    shortId: '0123456789abcdef',
    serverName: 'www.example.com',
    flow: 'xtls-rprx-vision',
    fingerprint: 'chrome',
    spiderX: '/',
  };
}
