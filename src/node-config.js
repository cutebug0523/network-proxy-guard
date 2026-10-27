import fs from 'node:fs';
import net from 'node:net';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_ID = /^[0-9a-f]{2,16}$/i;

export const SENSITIVE_SUFFIXES = [
  'anthropic.com', 'claude.ai', 'openai.com', 'chatgpt.com', 'openrouter.ai',
  'stripe.com', 'stripe.network', 'stripe.global',
];

export function readNodeConfig(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validateNodeConfig(parsed);
}

export function validateNodeConfig(input) {
  const required = ['name', 'address', 'port', 'uuid', 'publicKey', 'shortId', 'serverName'];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      throw new Error(`Missing node field: ${key}`);
    }
  }
  const node = {
    name: String(input.name).trim(),
    address: String(input.address).trim(),
    port: Number(input.port),
    uuid: String(input.uuid).trim(),
    publicKey: String(input.publicKey).trim(),
    shortId: String(input.shortId).trim(),
    serverName: String(input.serverName).trim(),
    flow: String(input.flow ?? 'xtls-rprx-vision').trim(),
    fingerprint: String(input.fingerprint ?? 'chrome').trim(),
    spiderX: String(input.spiderX ?? '/').trim(),
  };
  if (!node.name || /[\r\n]/.test(node.name)) throw new Error('Invalid node name');
  if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) throw new Error('Invalid node port');
  if (!UUID.test(node.uuid)) throw new Error('Invalid UUID');
  if (!SHORT_ID.test(node.shortId) || node.shortId.length % 2 !== 0) throw new Error('Short ID must be even-length hex');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(node.publicKey) || /REPLACE|EXAMPLE/i.test(node.publicKey)) {
    throw new Error('Public key is missing or still a placeholder');
  }
  if (!/^[A-Za-z0-9.-]+$/.test(node.serverName)) throw new Error('Invalid serverName');
  if (!/^[A-Za-z0-9:.-]+$/.test(node.address)) throw new Error('Invalid node address');
  return node;
}

export function buildVlessUri(nodeInput) {
  const node = validateNodeConfig(nodeInput);
  const host = net.isIP(node.address) === 6 ? `[${node.address}]` : node.address;
  const params = new URLSearchParams({
    type: 'tcp',
    security: 'reality',
    encryption: 'none',
    flow: node.flow,
    sni: node.serverName,
    fp: node.fingerprint,
    pbk: node.publicKey,
    sid: node.shortId,
    spx: node.spiderX,
  });
  return `vless://${node.uuid}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`;
}

export function buildMihomoProfile(nodeInput) {
  const node = validateNodeConfig(nodeInput);
  const group = '节点选择';
  const addressVersion = net.isIP(node.address);
  const serverRule = addressVersion === 4
    ? `IP-CIDR,${node.address}/32,DIRECT,no-resolve`
    : addressVersion === 6
      ? `IP-CIDR6,${node.address}/128,DIRECT,no-resolve`
      : `DOMAIN,${node.address},DIRECT`;
  const rules = [
    serverRule,
    ...SENSITIVE_SUFFIXES.map((suffix) => `DOMAIN-SUFFIX,${suffix},${group}`),
    `GEOSITE,google,${group}`,
    'GEOSITE,CN,DIRECT',
    'GEOIP,CN,DIRECT,no-resolve',
    `MATCH,${group}`,
  ];
  return {
    proxies: [{
      name: node.name,
      type: 'vless',
      server: node.address,
      port: node.port,
      uuid: node.uuid,
      network: 'tcp',
      udp: true,
      tls: true,
      servername: node.serverName,
      flow: node.flow,
      'client-fingerprint': node.fingerprint,
      'reality-opts': {
        'public-key': node.publicKey,
        'short-id': node.shortId,
      },
    }],
    'proxy-groups': [{ name: group, type: 'select', proxies: [node.name] }],
    rules,
  };
}
